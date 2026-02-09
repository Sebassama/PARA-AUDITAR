import "@/app/globals.css"
import { ThemeProvider } from "../components/theme-provider"
import Navbar from "../components/Navbar"
import Footer from "../components/Footer"
import { WalletProvider } from "../contexts/WalletContext"

export default function App({ Component, pageProps }) {
    return (
        <ThemeProvider defaultTheme="light" attribute="class">
            <WalletProvider>
                <div className="flex min-h-screen flex-col">
                    <Navbar />
                    <main className="flex-1">
                        <Component {...pageProps} />
                    </main>
                    <Footer />
                </div>
            </WalletProvider>
        </ThemeProvider>
    )
}
