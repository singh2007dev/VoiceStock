# VoiceStock 🎙️

**AI-powered, voice-based inventory management for small kirana stores in India.**

VoiceStock helps shopkeepers manage their inventory using natural voice commands instead of manually updating stock records.

Built for the **Great Indian AI Internship Challenge by Gnani AI**.

## 🚀 Features

- **Voice-based stock updates:** Add products and quantities using voice commands.
- **Stock enquiries:** Ask how much stock is available.
- **Stock reduction:** Record sold products through voice commands.
- **Inventory dashboard:** View products and current stock levels.
- **Low-stock alerts:** Identify products that need restocking.
- **Voice responses:** Hear confirmations using text-to-speech.

## 🛠️ Tech Stack

| Component | Technology |
|---|---|
| Frontend | React, Vite |
| Styling | CSS |
| Backend | Python, FastAPI |
| Database | SQLite |
| Speech-to-Text | Gnani AI Prisma |
| Text-to-Speech | Gnani AI Timbre |

## 🔄 How It Works

1. The shopkeeper speaks a command.
2. Gnani AI Prisma converts speech into text.
3. The backend identifies the requested inventory operation.
4. The inventory database is updated or queried.
5. Gnani AI Timbre generates a spoken response.
6. The dashboard displays the updated inventory.

## ⚙️ Setup

### 1. Clone the repository

```bash
git clone https://github.com/singh2007dev/VoiceStock.git
cd VoiceStock
```

### 2. Backend setup

Create and activate a virtual environment:

```bash
python -m venv .venv
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Create a `.env` file and add your Gnani API key:

```env
GNANI_API_KEY=your_gnani_api_key_here
```

Never commit your real API key.

### 3. Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Open the local URL displayed by Vite.

## 🎯 Project Goal

VoiceStock aims to make inventory management simpler and more accessible for small Indian retailers by allowing them to manage stock through natural conversation.

**Core idea: Let shopkeepers manage their inventory by simply talking.**

## 👨‍💻 Developer

**Ishveer Singh Bains**

GitHub: [singh2007dev](https://github.com/singh2007dev)
