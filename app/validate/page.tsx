"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertCircle, CheckCircle2, Upload, Link as LinkIcon, Download, XCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { openIpfsWithFailover } from "@/app/lib/ipfs-failover"

// Helpers
import script from "crypto-js"

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const wordArray = script.lib.WordArray.create(bytes as any);
  return script.SHA256(wordArray).toString(script.enc.Hex);
}

export const IPFS_GATEWAY_BASE =
  (process.env.NEXT_PUBLIC_IPFS_GATEWAY || 'https://192.168.101.192').replace(/\/+$/, '');

export const ALGO_EXPLORER_BASE =
  (process.env.NEXT_PUBLIC_ALGO_EXPLORER_BASE || 'https://explorer.perawallet.app').replace(/\/+$/, '');


type ValidateDetails = {
  filename?: string
  hashHex: string
  wallet?: string | null
  cid?: string | null
  tipo?: string | null
  nombre?: string | null
  txId?: string | null
  round?: number | null
  onchainNoteMatches?: boolean
  ipfsAvailable?: boolean
  version?: "v1" | "v2" | string | null
  processAtLocal?: string | null
  source?: string
}

export default function ValidatePage() {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [fileError, setFileError] = useState<string>("")  // NUEVO: Estado para errores de archivo

  const [result, setResult] = useState<{
    valid: boolean
    message: string
    details?: ValidateDetails
  } | null>(null)

  // NUEVO: Función de validación de PDF
  const validatePDFFile = (file: File): boolean => {
    setFileError("")
    
    // Validar extensión del archivo
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setFileError("❌ Error: Solo se permiten archivos PDF")
      return false
    }

    // Validar tipo MIME
    if (file.type !== 'application/pdf') {
      setFileError("❌ Error: El archivo debe ser un PDF válido")
      return false
    }

    // Validar tamaño (opcional - ejemplo: 1MB)
    const maxSizeMB = 5
    const maxSize = maxSizeMB * 1024 * 1024
    if (file.size > maxSize) {
      setFileError(`❌ Error: El archivo excede el tamaño máximo de ${maxSizeMB}MB`)
      return false
    }

    // Validar que el archivo no esté vacío
    if (file.size === 0) {
      setFileError("❌ Error: El archivo PDF está vacío")
      return false
    }

    return true
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    
    if (selectedFile) {
      // MODIFICADO: Validar antes de establecer el archivo
      if (validatePDFFile(selectedFile)) {
        setFile(selectedFile)
        setResult(null)
        setFileError("")  // Limpiar error si todo está bien
      } else {
        setFile(null)
        setResult(null)
        // Limpiar el input
        e.target.value = ''
      }
    }
  }

  const validateCertificate = async () => {
    if (!file) return
    setBusy(true)
    try {
      // 1) Calcular hash del PDF
      const bytes = await file.arrayBuffer()
      const hashHex = await sha256Hex(bytes)

      // 2) Backend: DB -> txId -> Indexer (la fecha viene del NOTE via Indexer)
      const resp = await fetch(`/api/validate/hash/${hashHex}`)
      const data = await resp.json()

      const source = data?.source || (data?.meta ? 'ipfs-index' : 'indexer-lookup');
      console.log('validate source:', source, data);

      if (!resp.ok) {
        setResult({
          valid: false,
          message: data?.error || "Error de validación.",
          details: {
            filename: file.name,
            hashHex,
          },
        })
        return
      }

      const matches = !!data.matches

      // Extraer datos según la fuente
      let wallet = null
      let cid = null
      let tipo = null
      let nombre = null
      let txId = null
      let round = null
      let processAtLocal = null
      let version = null
      let onchainNoteMatches = false

      if (source === 'ipfs-index' && data.meta) {
        // Caso: Solo IPFS (indexer falló)
        wallet = data.meta.wallet || null
        cid = data.meta.pdf_cid || data.meta.cid || null
        tipo = data.meta.title || null
        nombre = data.meta.owner || null
        version = data.meta.version || null
        txId = data.meta.txid || null
        processAtLocal = data.meta.timestamp || null
        onchainNoteMatches = false

        // No hay round ni processAtLocal porque no se pudo verificar en indexer
      } else if (data.indexer) {
        // Caso: Indexer + IPFS (verificación completa)
        const idx = data.indexer
        const parsed = idx.parsed || {}
        wallet = parsed.wallet || idx.from || null
        cid = parsed.cid || null
        tipo = parsed.tipo || null
        nombre = parsed.nombre || null
        txId = idx.txId || null
        round = idx.round ?? null
        processAtLocal = idx?.dates?.processAtLocal || null
        version = parsed.version || null

      }

      setResult({
        valid: matches,
        message: data.message || (matches ? "Certificado verificado." : "No se pudo verificar completamente."),
        details: {
          filename: file.name,
          hashHex,
          wallet,
          cid,
          tipo,
          nombre,
          txId,
          round,
          onchainNoteMatches: matches,
          ipfsAvailable: !!cid,
          version,
          processAtLocal,
          source, // Incluir source para debugging
        },
      })
    } catch (e) {
      console.error(e)
      setResult({
        valid: false,
        message: "Error al validar el certificado.",
      })
    } finally {
      setBusy(false)
    }
  }

  const abrirTxEnExplorer = () => {
    const txId = result?.details?.txId;
    if (txId)
      window.open(`${ALGO_EXPLORER_BASE}/tx/${txId}`, "_blank");
  }

  const abrirEnIPFS = () => {
    const cid = result?.details?.cid;
    if (cid) openIpfsWithFailover(cid);
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center">Validación de Certificados</h1>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Sube tu certificado para validar</CardTitle>
            <CardDescription>
              Validaremos el documento mediante la Blockchain de Algorand e IPFS.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid w-full items-center gap-4">
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="certificate">Archivo de Certificado (PDF)</Label>
                <div className="flex items-center gap-2">
                  <Input 
                    id="certificate" 
                    type="file" 
                    accept=".pdf,application/pdf"  // MODIFICADO: accept más específico
                    onChange={handleFileChange} 
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Solo archivos PDF
                </p>
              </div>

              {/* NUEVO: Mensaje de error de archivo */}
              {fileError && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertTitle>Archivo no válido</AlertTitle>
                  <AlertDescription>{fileError}</AlertDescription>
                </Alert>
              )}

              {/* NUEVO: Mensaje de archivo seleccionado correctamente */}
              {file && !fileError && (
                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertTitle className="text-green-800">Archivo listo</AlertTitle>
                  <AlertDescription className="text-green-700">
                    <strong>{file.name}</strong> ({(file.size / 1024).toFixed(2)} KB)
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full" onClick={validateCertificate} disabled={!file || busy || !!fileError}>
              <Upload className="mr-2 h-4 w-4" /> {busy ? "Validando..." : "Validar Certificado"}
            </Button>
          </CardFooter>
        </Card>

        {result && (
          <Alert variant={result.valid ? "default" : "destructive"}>
            {result.valid ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <AlertTitle>{result.valid ? "Certificado Válido" : "Certificado Inválido"}</AlertTitle>
            <AlertDescription>{result.message}</AlertDescription>
          </Alert>
        )}

        {result?.details && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Detalles verificados</CardTitle>
              <CardDescription>
                Fuente: Nota on-chain (Indexer)
                {result.details.cid ? " + IPFS" : ""}
                {result.details.version ? ` • ${result.details.version}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="font-medium">Archivo</p>
                    <p className="text-muted-foreground break-words">{result.details.filename || "(sin nombre)"}</p>
                  </div>
                  <div>
                    <p className="font-medium">Wallet asociada</p>
                    <p className="text-muted-foreground break-words">{result.details.wallet || "(n/d)"}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="font-medium">Hash (SHA-256)</p>
                    <p className="text-muted-foreground font-mono break-all">{result.details.hashHex}</p>
                  </div>

                  {/* v2 */}
                  {result.details.nombre && (
                    <div>
                      <p className="font-medium">Nombre</p>
                      <p className="text-muted-foreground break-words">{result.details.nombre}</p>
                    </div>
                  )}
                  {result.details.tipo && (
                    <div>
                      <p className="font-medium">Tipo de certificado</p>
                      <p className="text-muted-foreground break-words">{result.details.tipo}</p>
                    </div>
                  )}

                  {/* v1 */}
                  <div>
                    <p className="font-medium">CID (IPFS)</p>
                    <p className="text-muted-foreground break-words">{result.details.cid || "(n/d)"}</p>
                  </div>
                  <div>
                    <p className="font-medium">IPFS disponible</p>
                    <p className="text-muted-foreground">{result.details.ipfsAvailable ? "Sí" : "No"}</p>
                  </div>

                  <div>
                    <p className="font-medium">TxID</p>
                    <p className="text-muted-foreground break-all">{result.details.txId || "(sin transacción)"}</p>
                  </div>
                  <div>
                    <p className="font-medium">Round confirmado</p>
                    <p className="text-muted-foreground">
                      {typeof result.details.round === "number" ? result.details.round : "(n/d)"}
                    </p>
                  </div>

                  {/* NUEVO: Fecha de proceso (Ecuador) */}
                  {result.details.processAtLocal && (
                    <div className="sm:col-span-2">
                      <p className="font-medium">Fecha de proceso (EC)</p>
                      <p className="text-muted-foreground">{result.details.processAtLocal}</p>
                    </div>
                  )}

                  <div>
                    <p className="font-medium">Note on-chain coincide</p>
                    <p className="text-muted-foreground">{result.details.onchainNoteMatches ? "Sí" : "No"}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2">
                  {result.details.txId && (
                    <Button
                      type="button"
                      variant="link"
                      className="p-0 h-auto inline-flex items-center gap-2"
                      onClick={abrirTxEnExplorer}
                    >
                      <LinkIcon className="w-4 h-4" /> Ver en AlgoExplorer
                    </Button>
                  )}
                  {result.details.cid && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={abrirEnIPFS}
                      className="inline-flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" /> Abrir en IPFS
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

