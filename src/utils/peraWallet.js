// Simulación de integración con PeraWallet
// En una implementación real, se utilizaría la biblioteca oficial de PeraWallet

export const connectToPeraWallet = async () => {
  // Simulación de conexión a PeraWallet
  console.log("Conectando a PeraWallet...")

  // Simular un retraso para la conexión
  await new Promise((resolve) => setTimeout(resolve, 1000))

  // Generar una dirección de Algorand aleatoria para simular
  const walletAddress = "ALGO" + Math.random().toString(36).substring(2, 15).toUpperCase()

  console.log("Conectado a PeraWallet con dirección:", walletAddress)

  return walletAddress
}

export const disconnectFromPeraWallet = () => {
  console.log("Desconectando de PeraWallet...")
  // En una implementación real, aquí se desconectaría de la wallet
}

export const signTransaction = async (transaction) => {
  console.log("Firmando transacción:", transaction)
  // Simular un retraso para la firma
  await new Promise((resolve) => setTimeout(resolve, 1000))

  // Simular una firma
  const signature = "SIG" + Math.random().toString(36).substring(2, 15).toUpperCase()

  return signature
}
