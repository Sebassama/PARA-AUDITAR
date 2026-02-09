import CryptoJS from "crypto-js"

// Función para generar un hash MD5 de un archivo
export const generateMD5Hash = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      try {
        const binary = event.target.result
        const md5Hash = CryptoJS.MD5(CryptoJS.lib.WordArray.create(binary)).toString()
        resolve(md5Hash)
      } catch (error) {
        reject(error)
      }
    }

    reader.onerror = (error) => {
      reject(error)
    }

    reader.readAsArrayBuffer(file)
  })
}

// Función para verificar un hash contra la blockchain (simulada)
export const verifyHashOnBlockchain = async (hash) => {
  // Simulación de verificación en blockchain
  console.log("Verificando hash en blockchain:", hash)

  // Simular un retraso para la verificación
  await new Promise((resolve) => setTimeout(resolve, 1500))

  // Para propósitos de demostración, consideramos válidos los hashes que comienzan con 'a'
  const isValid = hash.startsWith("a")

  return {
    isValid,
    timestamp: isValid ? new Date().toISOString() : null,
    issuer: isValid ? "ALGO123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ" : null,
    type: isValid ? (Math.random() > 0.5 ? "Título" : "Certificado") : null,
  }
}

// Función para registrar un hash en la blockchain (simulada)
export const registerHashOnBlockchain = async (hash, type, metadata) => {
  // Simulación de registro en blockchain
  console.log("Registrando hash en blockchain:", hash, type, metadata)

  // Simular un retraso para el registro
  await new Promise((resolve) => setTimeout(resolve, 2000))

  // Simular un ID de transacción
  const txId = "TX" + Math.random().toString(36).substring(2, 15).toUpperCase()

  return {
    txId,
    timestamp: new Date().toISOString(),
    hash,
  }
}
