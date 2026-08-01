# SmartStock AI 📈

SmartStock AI is a state-of-the-art, enterprise-grade machine learning platform designed for automated dataset profiling, exploratory data analysis, dynamic time-series forecasting, and comprehensive AI analytics. Built with a modern microservices architecture, it empowers business users and data scientists alike to generate highly accurate predictions with zero code.

---

## 🚀 Key Features

* **Automated Data Profiling**: Intelligent schema detection, feature engineering, and robust dataset preview capabilities using `ydata-profiling`.
* **Dynamic Time-Series Forecasting**: Choose between multiple cutting-edge forecasting algorithms (AutoML, Prophet, ARIMA, SARIMA, Random Forest, XGBoost, LightGBM, CatBoost) dynamically.
* **Intelligent Auto-Selection**: The platform automatically compares models and selects the "Champion Model" based on MAPE and RMSE metrics.
* **Explainable AI (XAI)**: Comprehensive SHAP value analysis to interpret feature importance and model decisions.
* **Enterprise Dashboard**: A "Power BI-style" React glassmorphism dashboard featuring multi-chart analytics, residual analysis, and data export.
* **Robust Security**: JWT-based authentication, password encryption, and strict multi-tenant dataset isolation.
* **High-Performance Backend**: Built with FastAPI, utilizing asynchronous non-blocking IO and a modular architecture.

---

## 🛠 Tech Stack & Architecture

### **Frontend**
* **Framework**: React 18 with TypeScript
* **Build Tool**: Vite (Lightning fast HMR)
* **Styling**: Tailwind CSS (Glassmorphism design, dark/light mode)
* **Routing**: React Router DOM v6
* **Data Visualization**: Recharts (Interactive charts)
* **State Management**: React Context API
* **Animations**: Framer Motion
* **Exports**: jsPDF & html2canvas

### **Backend**
* **Framework**: FastAPI (Python 3.11)
* **Database**: SQLite (SQLAlchemy ORM)
* **Machine Learning**: Scikit-Learn, Prophet, XGBoost, LightGBM, CatBoost, Statsmodels
* **Data Processing**: Pandas, NumPy, YData-Profiling
* **Authentication**: JWT & Passlib (Bcrypt)

### **Architecture Overview**
The application uses a separated frontend/backend pattern. The frontend communicates with the FastAPI backend via RESTful APIs. The backend processes datasets asynchronously, runs intensive machine learning workloads (like SHAP and GridSearch) in a decoupled service layer, and returns comprehensive analytics payloads.

---

## ⚙️ Installation & Setup

### Prerequisites
* **Node.js** (v18 or higher)
* **Python** (v3.10 or higher)
* **Git**

### 1. Clone the Repository
```bash
git clone https://github.com/viswateja5/SmartStock-AI.git
cd SmartStock-AI
```

### 2. Backend Setup
Navigate to the backend directory and set up the Python environment:
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows use `venv\Scripts\activate`

# Install dependencies
pip install -r requirements.txt
```

### 3. Frontend Setup
Open a new terminal, navigate to the frontend directory, and install Node dependencies:
```bash
cd frontend
npm install
```

---

## 🔑 Environment Variables

### Backend (`backend/.env`)
Create a `.env` file in the `backend/` directory:
```env
# JWT Security
SECRET_KEY=your_super_secret_key_here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# Database
DATABASE_URL=sqlite:///./smartstock.db

# Storage
STORAGE_DIR=data/datasets
```

### Frontend (`frontend/.env`)
Create a `.env` file in the `frontend/` directory (if configuring custom URLs):
```env
VITE_API_URL=http://localhost:8000
```

---

## 🏃‍♂️ Running the Application

### Running the Backend
Ensure your virtual environment is activated, then run the FastAPI server:
```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
The backend API documentation will be available at `http://localhost:8000/docs`.

### Running the Frontend
In a separate terminal, start the Vite development server:
```bash
cd frontend
npm run dev
```
The application will be accessible at `http://localhost:5173`.

---

## 🐳 Docker (Optional for Production)

If you wish to deploy the application using Docker, use the included `docker-compose.yml`:

```bash
# Build and run the containers
docker-compose up --build -d
```
This will automatically spin up both the FastAPI backend and the React frontend on their respective ports.

---

## 🔮 Future Improvements
* **Advanced Deep Learning**: Integrate LSTM, Transformers (e.g. TimeGPT), and DeepAR for complex long-term forecasting.
* **Real-time Streaming**: Integrate Apache Kafka for real-time stock ticker analysis.
* **External API Integration**: Connect to Yahoo Finance, Alpha Vantage, and Bloomberg APIs to enrich user-uploaded datasets automatically.
* **Distributed Training**: Integrate Ray or Dask for parallelized multi-node training on massive datasets.

---

<p align="center">
  <i>Built with ❤️ for Enterprise Analytics.</i>
</p>
