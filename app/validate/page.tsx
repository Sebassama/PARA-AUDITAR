"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertCircle, CheckCircle2, Upload, Link as LinkIcon, Download, XCircle, Mail, Clock, LogOut } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { openIpfsWithFailover } from "@/app/lib/ipfs-failover"
import { usePublicAuth } from "@/hooks/usePublicAuth"
import script from "crypto-js"

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const wordArray = script.lib.WordArray.create(bytes as any);
  return script.SHA256(wordArray).toString(script.enc.Hex);
}

const ALGO_EXPLORER_BASE = (process.env.NEXT_PUBLIC_ALGO_EXPLORER_BASE || 'https://explorer.perawallet.app').replace(/\/+$/, '');

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
  const { 
    isAuthenticated, 
    loading: authLoading, 
    error: authError,
    signIn, 
    signOut,
    userEmail,
    timeRemaining
  } = usePublicAuth();

  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [fileError, setFileError] = useState<string>("")

  const [result, setResult] = useState<{
    valid: boolean
    message: string
    details?: ValidateDetails
  } | null>(null)

  const validatePDFFile = (file: File): boolean => {
    setFileError("")
    
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setFileError("❌ Error: Solo se permiten archivos PDF")
      return false
    }

    if (file.type !== 'application/pdf') {
      setFileError("❌ Error: El archivo debe ser un PDF válido")
      return false
    }

    const maxSizeMB = 5
    const maxSize = maxSizeMB * 1024 * 1024
    if (file.size > maxSize) {
      setFileError(`❌ Error: El archivo excede el tamaño máximo de ${maxSizeMB}MB`)
      return false
    }

    if (file.size === 0) {
      setFileError("❌ Error: El archivo PDF está vacío")
      return false
    }

    return true
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    
    if (selectedFile) {
      if (validatePDFFile(selectedFile)) {
        setFile(selectedFile)
        setResult(null)
        setFileError("")
      } else {
        setFile(null)
        setResult(null)
        e.target.value = ''
      }
    }
  }

  const validateCertificate = async () => {
    if (!file) return
    setBusy(true)
    try {
      const bytes = await file.arrayBuffer()
      const hashHex = await sha256Hex(bytes)

      const resp = await fetch(`/api/validate/hash/${hashHex}`)
      const data = await resp.json()

      const source = data?.source || (data?.meta ? 'ipfs-index' : 'indexer-lookup');

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

      let wallet = null
      let cid = null
      let tipo = null
      let nombre = null
      let txId = null
      let round = null
      let processAtLocal = null
      let version = null

      if (source === 'ipfs-index' && data.meta) {
        wallet = data.meta.wallet || null
        cid = data.meta.pdf_cid || data.meta.cid || null
        tipo = data.meta.title || null
        nombre = data.meta.owner || null
        version = data.meta.version || null
        txId = data.meta.txid || null
        processAtLocal = data.meta.timestamp || null
      } else if (data.indexer) {
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
          source,
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
    if (txId) window.open(`${ALGO_EXPLORER_BASE}/tx/${txId}`, "_blank");
  }

  const abrirEnIPFS = () => {
    const cid = result?.details?.cid;
    if (cid) openIpfsWithFailover(cid);
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="w-[400px]">
          <CardContent className="pt-6">
            <p className="text-center">Verificando autenticación...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <Card className="border-blue-200 shadow-lg">
          <CardHeader className="space-y-3 pb-4">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center">
                <Mail className="h-8 w-8 text-blue-600" />
              </div>
            </div>
            <CardTitle className="text-center text-2xl">
              Autenticación Requerida
            </CardTitle>
            <CardDescription className="text-center text-base">
              Para validar certificados, inicia sesión con tu cuenta Microsoft
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <Alert className="bg-blue-50 border-blue-200">
              <Mail className="h-4 w-4 text-blue-600" />
              <AlertTitle>Acceso Público</AlertTitle>
              <AlertDescription>
                Puedes usar <strong>cualquier cuenta Microsoft</strong>:
                <ul className="mt-2 space-y-1 text-sm">
                  <li>• Outlook.com</li>
                  <li>• Hotmail.com</li>
                  <li>• Live.com</li>
                  <li>• Correo institucional (.onmicrosoft.com)</li>
                </ul>
              </AlertDescription>
            </Alert>

            <Alert className="bg-amber-50 border-amber-200">
              <Clock className="h-4 w-4 text-amber-600" />
              <AlertTitle>Sesión Temporal</AlertTitle>
              <AlertDescription>
                Tu sesión durará <strong>10 minutos</strong> por seguridad.
              </AlertDescription>
            </Alert>

            {authError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription className="whitespace-pre-wrap">
                  {authError}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>

          <CardFooter>
            <Button onClick={signIn} className="w-full" size="lg">
              <Mail className="w-5 h-5 mr-2" />
              Iniciar con Microsoft
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Validación de Certificados</h1>
          <div className="flex items-center gap-4">
            <div className="text-sm text-right">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="w-3 h-3" />
                <span>{userEmail}</span>
              </div>
              <div className="flex items-center gap-2 text-amber-600 font-mono">
                <Clock className="w-3 h-3" />
                <span>{timeRemaining}</span>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Cerrar
            </Button>
          </div>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Sube tu certificado para validar</CardTitle>
            <CardDescription>
              Validaremos el documento mediante Blockchain e IPFS
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid w-full items-center gap-4">
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="certificate">Archivo de Certificado (PDF)</Label>
                <Input 
                  id="certificate" 
                  type="file" 
                  accept=".pdf,application/pdf"
                  onChange={handleFileChange} 
                />
                <p className="text-xs text-muted-foreground">Solo archivos PDF</p>
              </div>

              {fileError && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertTitle>Archivo no válido</AlertTitle>
                  <AlertDescription>{fileError}</AlertDescription>
                </Alert>
              )}

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
                Fuente: {result.details.source}
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

                  {result.details.nombre && (
                    <div>
                      <p className="font-medium">Nombre</p>
                      <p className="text-muted-foreground break-words">{result.details.nombre}</p>
                    </div>
                  )}
                  {result.details.tipo && (
                    <div>
                      <p className="font-medium">Tipo</p>
                      <p className="text-muted-foreground break-words">{result.details.tipo}</p>
                    </div>
                  )}

                  <div>
                    <p className="font-medium">CID (IPFS)</p>
                    <p className="text-muted-foreground break-words">{result.details.cid || "(n/d)"}</p>
                  </div>

                  <div>
                    <p className="font-medium">TxID</p>
                    <p className="text-muted-foreground break-all">{result.details.txId || "(n/d)"}</p>
                  </div>
                  <div>
                    <p className="font-medium">Round</p>
                    <p className="text-muted-foreground">
                      {typeof result.details.round === "number" ? result.details.round : "(n/d)"}
                    </p>
                  </div>

                  {result.details.processAtLocal && (
                    <div className="sm:col-span-2">
                      <p className="font-medium">Fecha de proceso (EC)</p>
                      <p className="text-muted-foreground">{result.details.processAtLocal}</p>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2">
                  {result.details.txId && (
                    <Button
                      type="button"
                      variant="link"
                      className="p-0 h-auto"
                      onClick={abrirTxEnExplorer}
                    >
                      <LinkIcon className="w-4 h-4 mr-2" /> Ver en Explorer
                    </Button>
                  )}
                  {result.details.cid && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={abrirEnIPFS}
                    >
                      <Download className="w-4 h-4 mr-2" /> Abrir IPFS
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
