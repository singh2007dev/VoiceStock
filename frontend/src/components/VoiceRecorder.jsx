import React, { useState, useRef, useEffect } from 'react'
import { api, DEFAULT_MOCK_STT } from '../services/api'

export function VoiceRecorder() {
  // Status: 'ready' | 'recording' | 'processing' | 'error'
  const [status, setStatus] = useState('ready')
  const [errorMessage, setErrorMessage] = useState('')
  const [transcriptResult, setTranscriptResult] = useState(null)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [isMockMode, setIsMockMode] = useState(DEFAULT_MOCK_STT)

  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const timerRef = useRef(null)
  const streamRef = useRef(null)

  // Clean up timer and media stream on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])

  const startRecording = async () => {
    setErrorMessage('')
    setTranscriptResult(null)
    setRecordingSeconds(0)

    // Check browser support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus('error')
      setErrorMessage('Audio recording is not supported in this browser.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Pick best supported mimeType
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/wav',
      ]
      let selectedMime = ''
      if (typeof MediaRecorder.isTypeSupported === 'function') {
        selectedMime = mimeTypes.find((m) => MediaRecorder.isTypeSupported(m)) || ''
      }

      const recorder = selectedMime
        ? new MediaRecorder(stream, { mimeType: selectedMime })
        : new MediaRecorder(stream)

      mediaRecorderRef.current = recorder
      audioChunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = async () => {
        // Stop microphone stream tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop())
          streamRef.current = null
        }

        const mime = recorder.mimeType || 'audio/webm'
        const audioBlob = new Blob(audioChunksRef.current, { type: mime })

        if (audioBlob.size === 0) {
          setStatus('error')
          setErrorMessage('Empty recording detected. Please speak into your microphone and try again.')
          return
        }

        // Determine appropriate extension
        let filename = 'voice_command.webm'
        if (mime.includes('mp4')) filename = 'voice_command.m4a'
        else if (mime.includes('ogg')) filename = 'voice_command.ogg'
        else if (mime.includes('wav')) filename = 'voice_command.wav'

        setStatus('processing')

        try {
          const result = await api.transcribeAudio(audioBlob, filename, isMockMode)
          setTranscriptResult(result)
          setStatus('ready')
        } catch (err) {
          setStatus('error')
          setErrorMessage(err.message || 'Failed to transcribe audio.')
        }
      }

      recorder.start(250) // slice into 250ms chunks
      setStatus('recording')

      // Track recording elapsed time
      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          // Max 30 seconds limit
          if (prev >= 29) {
            stopRecording()
            return 30
          }
          return prev + 1
        })
      }, 1000)
    } catch (err) {
      setStatus('error')
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMessage('Microphone access was denied. Please allow microphone permission in your browser address bar.')
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setErrorMessage('No microphone found on this device.')
      } else {
        setErrorMessage(`Microphone error: ${err.message || 'Unable to access microphone'}`)
      }
    }
  }

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }

  const cancelRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.ondataavailable = null
      mediaRecorderRef.current.onstop = null
      mediaRecorderRef.current.stop()
    }
    setStatus('ready')
    setRecordingSeconds(0)
    setErrorMessage('')
  }

  return (
    <div className="card voice-recorder-card">
      <div className="card-header voice-header">
        <div>
          <div className="voice-title-row">
            <h2 className="card-title">Voice Assistant</h2>
            <span className={`voice-status-pill status-${status}`}>
              <span className="status-dot"></span>
              {status === 'ready' && 'Ready'}
              {status === 'recording' && `Recording (${recordingSeconds}s / 30s)`}
              {status === 'processing' && 'Transcribing...'}
              {status === 'error' && 'Error'}
            </span>
          </div>
          <p className="card-subtitle">
            Speak into your microphone to record kirana inventory commands
          </p>
        </div>

        {/* Mock Mode Credit Protection Switch */}
        <div className="mock-toggle-wrap">
          <label className="mock-label" title="Protects Gnani API credits by using mock transcription">
            <input
              type="checkbox"
              checked={isMockMode}
              onChange={(e) => setIsMockMode(e.target.checked)}
              disabled={status === 'recording' || status === 'processing'}
            />
            <span className={`mock-badge ${isMockMode ? 'mock-active' : 'mock-live'}`}>
              {isMockMode ? '🛡️ Mock Mode (Credit Protected)' : '⚡ Live Gnani API'}
            </span>
          </label>
        </div>
      </div>

      <div className="voice-body">
        {/* Main Microphone Action Button */}
        <div className="voice-controls">
          {status !== 'recording' ? (
            <button
              type="button"
              className={`btn btn-voice ${status === 'processing' ? 'btn-voice-processing' : 'btn-voice-ready'}`}
              onClick={startRecording}
              disabled={status === 'processing'}
              aria-label="Start recording voice command"
            >
              {status === 'processing' ? (
                <>
                  <span className="spinner spinner-large"></span>
                  <span>Transcribing Audio...</span>
                </>
              ) : (
                <>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="22"/>
                  </svg>
                  <span>Tap to Speak</span>
                </>
              )}
            </button>
          ) : (
            <div className="recording-action-group">
              <button
                type="button"
                className="btn btn-voice btn-voice-recording"
                onClick={stopRecording}
                aria-label="Stop recording and transcribe"
              >
                <span className="record-pulse"></span>
                <span>Stop & Transcribe ({recordingSeconds}s)</span>
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={cancelRecording}
                title="Cancel without transcribing"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Error message banner */}
        {status === 'error' && errorMessage && (
          <div className="form-error-banner voice-error-banner" role="alert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Transcript Result Display */}
        {transcriptResult && (
          <div className="transcript-box" role="region" aria-label="Speech transcription result">
            <div className="transcript-header">
              <span className="transcript-title">Recognized Speech</span>
              <span className="transcript-lang">
                Detected Language: <strong>{transcriptResult.language || 'en'}</strong>
              </span>
            </div>
            <p className="transcript-text">"{transcriptResult.transcript}"</p>
            {isMockMode && (
              <span className="transcript-mock-note">
                Sample transcription provided by local mock mode. Toggle to "Live Gnani API" above when ready for production transcription.
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
