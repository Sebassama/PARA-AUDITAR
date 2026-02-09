import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom"
import { ThemeProvider } from "./components/theme-provider"
import Navbar from "./components/Navbar"
import Footer from "./components/Footer"
import HomePage from "./pages/HomePage"
import AdminPage from "./pages/AdminPage"
import SecretaryPage from "./pages/SecretaryPage"
import GroupPage from "./pages/GroupPage"
import { WalletProvider } from "./contexts/WalletContext"
import ProtectedRoute from "./components/ProtectedRoute"

function App() {
  return (
    <ThemeProvider defaultTheme="light">
      <WalletProvider>
        <Router>
          <div className="flex min-h-screen flex-col">
            <Navbar />
            <main className="flex-1">
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute requiredRole="admin">
                      <AdminPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/secretary"
                  element={
                    <ProtectedRoute requiredRole="secretaria">
                      <SecretaryPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/group"
                  element={
                    <ProtectedRoute requiredRole="grupo">
                      <GroupPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
            <Footer />
          </div>
        </Router>
      </WalletProvider>
    </ThemeProvider>
  )
}

export default App
