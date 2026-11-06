import React, { useState, useRef, useEffect } from 'react'
import { api, DEFAULT_MOCK_STT } from '../services/api'

// Helper to convert a WebM/Opus Blob to WAV using Web Audio API
// Returns a Blob with MIME type 'audio/wav'
async function convertWebMToWav(webmBlob) {
  // Read the blob as an ArrayBuffer
  const arrayBuffer = await new Response(webmBlob).arrayBuffer()
  // Decode audio data (browser will handle WebM/Opus decoding)
  const audioContext = new (window.AudioContext || window.webkitAudioContext)()
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

  // Resample to 16kHz (Gnani recommends 16kHz PCM)
  const targetSampleRate = 16000
  const numberOfChannels = audioBuffer.numberOfChannels
  const duration = audioBuffer.duration
  const length = Math.ceil(targetSampleRate * duration)
  const offlineCtx = new OfflineAudioContext(numberOfChannels, length, targetSampleRate)
  const bufferSource = offlineCtx.createBufferSource()
  bufferSource.buffer = audioBuffer
  bufferSource.connect(offlineCtx.destination)
  bufferSource.start(0)
  const resampledBuffer = await offlineCtx.startRendering()

  // Prepare PCM data (interleaved if stereo)
  const numChannels = resampledBuffer.numberOfChannels
  const sampleRate = resampledBuffer.sampleRate
  const wavLength = resampledBuffer.length * numChannels
  const wavBuffer = new Float32Array(wavLength)
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = resampledBuffer.getChannelData(channel)
    for (let i = 0; i < resampledBuffer.length; i++) {
      wavBuffer[i * numChannels + channel] = channelData[i]
    }
  }

  // Convert Float32 PCM to 16-bit PCM
  const wavData = new DataView(new ArrayBuffer(44 + wavBuffer.length * 2))
  // RIFF header
  writeString(wavData, 0, 'RIFF')
  wavData.setUint32(4, 36 + wavBuffer.length * 2, true)
  writeString(wavData, 8, 'WAVE')
  // fmt subchunk
  writeString(wavData, 12, 'fmt ')
  wavData.setUint32(16, 16, true) // Subchunk1Size (16 for PCM)
  wavData.setUint16(20, 1, true) // AudioFormat (1 = PCM)
  wavData.setUint16(22, numChannels, true)
  wavData.setUint32(24, sampleRate, true)
  wavData.setUint32(28, sampleRate * numChannels * 2, true) // ByteRate
  wavData.setUint16(32, numChannels * 2, true) // BlockAlign
  wavData.setUint16(34, 16, true) // BitsPerSample
  // data subchunk
  writeString(wavData, 36, 'data')
  wavData.setUint32(40, wavBuffer.length * 2, true)

  // Write PCM samples
  let offset = 44
  for (let i = 0; i < wavBuffer.length; i++) {
    const s = Math.max(-1, Math.min(1, wavBuffer[i]))
    wavData.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
    offset += 2
  }

  return new Blob([wavData], { type: 'audio/wav' })
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}

// export function VoiceRecorder() {

export function VoiceRecorder({ onInventoryUpdated, onCommandExecuted }) {
  // Status: 'ready' | 'recording' | 'processing' | 'error'
  const [status, setStatus] = useState('ready')
  const [errorMessage, setErrorMessage] = useState('')
  const [transcriptResult, setTranscriptResult] = useState(null)
  const [commandResult, setCommandResult] = useState(null)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [isMockMode, setIsMockMode] = useState(DEFAULT_MOCK_STT)
  const [mockCommandIndex, setMockCommandIndex] = useState(0)
  const [isTtsEnabled, setIsTtsEnabled] = useState(true)
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)

  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const timerRef = useRef(null)
  const streamRef = useRef(null)
  const currentAudioRef = useRef(null)

  const stopCurrentAudio = () => {
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause()
        if (currentAudioRef.current.src) {
          URL.revokeObjectURL(currentAudioRef.current.src)
        }
      } catch (e) {
        // ignore
      }
      currentAudioRef.current = null
      setIsPlayingAudio(false)
    }
  }

  const playTtsAudio = async (text, mockTts) => {
    stopCurrentAudio()
    if (!text) return

    try {
      setIsPlayingAudio(true)
      const audioBlob = await api.textToSpeech(text, mockTts)
      if (!audioBlob || audioBlob.size === 0) {
        setIsPlayingAudio(false)
        return
      }

      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)
      currentAudioRef.current = audio

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl)
        if (currentAudioRef.current === audio) {
          currentAudioRef.current = null
          setIsPlayingAudio(false)
        }
      }

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl)
        if (currentAudioRef.current === audio) {
          currentAudioRef.current = null
          setIsPlayingAudio(false)
        }
      }

      await audio.play().catch((playErr) => {
        console.warn('Audio auto-play prevented or failed:', playErr)
        URL.revokeObjectURL(audioUrl)
        if (currentAudioRef.current === audio) {
          currentAudioRef.current = null
          setIsPlayingAudio(false)
        }
      })
    } catch (ttsErr) {
      console.warn('Failed to fetch/play TTS audio:', ttsErr)
      setIsPlayingAudio(false)
    }
  }

  // Clean up timer, media stream, and audio on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
      stopCurrentAudio()
    }
  }, [])

  const startRecording = async () => {
    stopCurrentAudio()
    setErrorMessage('')
    setTranscriptResult(null)
    setCommandResult(null)
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
        const originalBlob = new Blob(audioChunksRef.current, { type: mime })

        if (originalBlob.size === 0) {
          setStatus('error')
          setErrorMessage('Empty recording detected. Please speak into your microphone and try again.')
          return
        }

        // Convert to WAV if needed (Gnani supports WAV, MP3, etc.)
        let audioBlob = originalBlob
        let filename = 'voice_command.wav'
        // If already a supported format, keep original
        if (mime.includes('wav')) {
          filename = 'voice_command.wav'
        } else if (mime.includes('mp4')) {
          filename = 'voice_command.m4a'
        } else if (mime.includes('ogg')) {
          filename = 'voice_command.ogg'
        } else {
          // Convert WebM/Opus to WAV using Web Audio API when not in mock mode
          if (!isMockMode) {
            try {
              const wavBlob = await convertWebMToWav(originalBlob)
              audioBlob = wavBlob
              filename = 'voice_command.wav'
            } catch (convErr) {
              console.error('Audio conversion failed', convErr)
              setStatus('error')
              setErrorMessage('Failed to convert audio to a supported format.')
              return
            }
          } else {
            // In mock mode we can keep the original blob; backend mock does not inspect format
            audioBlob = originalBlob
            filename = 'voice_command.webm'
          }
        }

        setStatus('processing')

        try {
          const result = await api.transcribeAudio(audioBlob, filename, isMockMode, mockCommandIndex)
          setTranscriptResult(result)

          if (result && result.transcript) {
            let cmdRes = null
            try {
              cmdRes = await api.executeVoiceCommand(result.transcript)
              setCommandResult(cmdRes)
              if (onInventoryUpdated) {
                await onInventoryUpdated()
              }
              if (onCommandExecuted) {
                onCommandExecuted(cmdRes)
              }
            } catch (cmdErr) {
              setCommandResult({
                success: false,
                message: cmdErr.message || 'Failed to execute voice command on inventory.',
              })
            }

            // Speak response aloud if TTS is enabled (exactly once, errors handled gracefully)
            if (isTtsEnabled && cmdRes && cmdRes.message) {
              try {
                await playTtsAudio(cmdRes.message, isMockMode)
              } catch (ttsErr) {
                console.warn('TTS playback error (non-fatal):', ttsErr)
              }
            }
          }

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

        {/* Voice and Mock Settings Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Spoken Response (TTS) Toggle */}
          <label className="mock-label" title="Speak response aloud using Gnani Timbre female Indian English voice (Yashvi)">
            <input
              type="checkbox"
              checked={isTtsEnabled}
              onChange={(e) => {
                if (!e.target.checked) stopCurrentAudio()
                setIsTtsEnabled(e.target.checked)
              }}
            />
            <span className={`mock-badge ${isTtsEnabled ? 'mock-active' : 'mock-live'}`} style={{ cursor: 'pointer' }}>
              {isTtsEnabled ? (isPlayingAudio ? '🔊 Speaking...' : '🔊 Voice Output: On') : '🔇 Voice Output: Off'}
            </span>
          </label>

          {/* Mock Mode Credit Protection Switch */}
          <div className="mock-toggle-wrap">
            <label className="mock-label" title="Protects Gnani API credits by using mock transcription and audio">
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
              aria-label={isMockMode ? "Run simulated voice command test" : "Start recording voice command"}
            >
              {status === 'processing' ? (
                <>
                  <span className="spinner spinner-large"></span>
                  <span>{isMockMode ? 'Simulating Voice Input...' : 'Transcribing Audio...'}</span>
                </>
              ) : (
                <>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="22"/>
                  </svg>
                  <span>{isMockMode ? 'Simulate Voice Input' : 'Tap to Speak'}</span>
                </>
              )}
            </button>
          ) : (
            <div className="recording-action-group">
              <button
                type="button"
                className="btn btn-voice btn-voice-recording"
                onClick={stopRecording}
                aria-label={isMockMode ? "Stop and run simulated input" : "Stop recording and transcribe"}
              >
                <span className="record-pulse"></span>
                <span>{isMockMode ? `Stop & Run Simulation (${recordingSeconds}s)` : `Stop & Transcribe (${recordingSeconds}s)`}</span>
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

        {/* Mock Mode Simulated Command Selector */}
        {isMockMode && (
          <div style={{ marginTop: '0.85rem', marginBottom: '0.25rem', textAlign: 'center' }}>
            <label style={{ fontSize: '0.83rem', color: '#475569', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: '#f1f5f9', padding: '0.35rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontWeight: 600 }}>Simulated Command:</span>
              <select
                value={mockCommandIndex}
                onChange={(e) => setMockCommandIndex(Number(e.target.value))}
                disabled={status === 'recording' || status === 'processing'}
                style={{
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.83rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#1e293b',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                <option value={0}>1. Add 20 packets of Maggi (Add stock)</option>
                <option value={1}>2. I sold 5 packets of Maggi (Sell stock)</option>
                <option value={2}>3. How much Maggi is left? (Check stock)</option>
                <option value={3}>4. Show low-stock products (List low stock)</option>
              </select>
            </label>
          </div>
        )}

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
          <div className="transcript-box" role="region" aria-label={isMockMode || transcriptResult.isSimulated ? "Simulated speech command" : "Speech transcription result"}>
            <div className="transcript-header">
              <span className="transcript-title">
                {isMockMode || transcriptResult.isSimulated ? '🧪 Simulated Input (Mock Mode)' : 'Recognized Speech'}
              </span>
              <span className="transcript-lang">
                {isMockMode || transcriptResult.isSimulated ? (
                  <span style={{ color: '#d97706', fontWeight: 600 }}>Simulation • Not Live Audio</span>
                ) : (
                  <>Detected Language: <strong>{transcriptResult.language || 'en'}</strong></>
                )}
              </span>
            </div>
            <p className="transcript-text" style={{ fontStyle: isMockMode || transcriptResult.isSimulated ? 'italic' : 'normal' }}>
              "{transcriptResult.transcript}"
            </p>
            {(isMockMode || transcriptResult.isSimulated) && (
              <span
                className="transcript-mock-note"
                style={{
                  display: 'block',
                  marginTop: '0.55rem',
                  color: '#92400e',
                  background: '#fef3c7',
                  padding: '0.45rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                  border: '1px solid #fde68a',
                  lineHeight: '1.4',
                }}
              >
                ℹ️ <strong>Simulated Input:</strong> In Mock Mode, microphone audio is not sent to Gnani STT. This is a predefined simulated command to test inventory workflows without spending API credits. Switch to <strong>Live Gnani API</strong> above to transcribe your actual spoken words.
              </span>
            )}
          </div>
        )}

        {/* Command Execution Result Feedback */}
        {commandResult && (
          <div
            className={`command-feedback-box ${commandResult.success ? 'command-feedback-success' : 'command-feedback-error'}`}
            style={{
              marginTop: '0.85rem',
              padding: '0.85rem 1rem',
              borderRadius: '8px',
              backgroundColor: commandResult.success ? '#ecfdf5' : '#fef2f2',
              border: `1px solid ${commandResult.success ? '#a7f3d0' : '#fecaca'}`,
              color: commandResult.success ? '#065f46' : '#991b1b',
              fontSize: '0.92rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
            role="status"
          >
            <span style={{ fontSize: '1.15rem' }}>{commandResult.success ? '✓' : '⚠️'}</span>
            <div>
              <strong>{commandResult.success ? 'Inventory Update:' : 'Command Notice:'}</strong>{' '}
              <span>{commandResult.message}</span>
            </div>
            {commandResult.message && isTtsEnabled && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => (isPlayingAudio ? stopCurrentAudio() : playTtsAudio(commandResult.message, isMockMode))}
                style={{
                  marginLeft: 'auto',
                  padding: '0.25rem 0.65rem',
                  fontSize: '0.82rem',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
                title={isPlayingAudio ? 'Stop speaking' : 'Play spoken response'}
              >
                {isPlayingAudio ? '⏹ Stop' : '🔊 Listen'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
