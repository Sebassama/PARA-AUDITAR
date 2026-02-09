"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { CheckCircle2, AlertCircle, Upload, FileCheck, Shield, Users } from "lucide-react"
import Link from "next/link"
import { generateMD5Hash, verifyHashOnBlockchain } from "../utils/hashUtils"

const HomePage = () => {
  const [file, setFile] = useState(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [verificationResult, setVerificationResult] = useState(null)
  const [fileHash, setFileHash] = useState("")

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      setVerificationResult(null)
      setFileHash("")
    }
  }

  const handleVerify = async () => {
    if (!file) return

    setIsVerifying(true)

    try {
      // Generar hash MD5 del archivo
      const hash = await generateMD5Hash(file)
      setFileHash(hash)

      // Verificar el hash en la blockchain (simulado)
      const result = await verifyHashOnBlockchain(hash)

      setVerificationResult(result)
    } catch (error) {
      console.error("Error al verificar el certificado:", error)
      setVerificationResult({
        isValid: false,
        error: "Ocurrió un error al procesar el archivo.",
      })
    } finally {
      setIsVerifying(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="flex flex-col items-center justify-center text-center mb-12">
        <h1 className="text-4xl font-bold tracking-tight mb-4">Sistema de Validación de Certificados</h1>
        <p className="text-lg text-muted-foreground max-w-2xl">
          Plataforma segura para la emisión y validación de certificados y títulos utilizando la tecnología blockchain
          de Algorand.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xl font-medium">Administrador</CardTitle>
            <Shield className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <CardDescription className="min-h-[80px]">
              Gestiona roles de usuarios y visualiza el historial completo de certificados y títulos emitidos.
            </CardDescription>
            <Link href="/admin">
              <Button className="w-full mt-4" variant="outline">
                Panel de Administrador
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xl font-medium">Secretaría</CardTitle>
            <FileCheck className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <CardDescription className="min-h-[80px]">
              Genera y emite títulos oficiales con respaldo en blockchain para garantizar su autenticidad.
            </CardDescription>
            <Link href="/secretary">
              <Button className="w-full mt-4" variant="outline">
                Panel de Secretaría
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xl font-medium">Grupos</CardTitle>
            <Users className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <CardDescription className="min-h-[80px]">
              Emite certificados para participantes de cursos, eventos y programas educativos.
            </CardDescription>
            <Link href="/group">
              <Button className="w-full mt-4" variant="outline">
                Panel de Grupos
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xl font-medium">Validación</CardTitle>
            <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <CardDescription className="min-h-[80px]">
              Verifica la autenticidad de certificados y títulos mediante su hash en la blockchain.
            </CardDescription>
            <Button
              className="w-full mt-4"
              variant="outline"
              onClick={() => document.getElementById("validation-section").scrollIntoView({ behavior: "smooth" })}
            >
              Validar Certificado
            </Button>
          </CardContent>
        </Card>
      </div>

      <div id="validation-section" className="max-w-3xl mx-auto mt-16">
        <Card>
          <CardHeader>
            <CardTitle>Validación de Certificados</CardTitle>
            <CardDescription>
              Sube un archivo PDF de certificado para verificar su autenticidad en la blockchain de Algorand.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid w-full items-center gap-4">
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="certificate">Archivo de Certificado (PDF)</Label>
                <div className="flex items-center gap-2">
                  <Input id="certificate" type="file" accept=".pdf" onChange={handleFileChange} />
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full" onClick={handleVerify} disabled={!file || isVerifying}>
              {isVerifying ? (
                <>Verificando...</>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" /> Validar Certificado
                </>
              )}
            </Button>
          </CardFooter>
        </Card>

        {fileHash && (
          <div className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Hash MD5 del Archivo</CardTitle>
              </CardHeader>
              <CardContent>
                <code className="block p-2 bg-muted rounded-md text-xs font-mono break-all">{fileHash}</code>
              </CardContent>
            </Card>
          </div>
        )}

        {verificationResult && (
          <Alert variant={verificationResult.isValid ? "default" : "destructive"} className="mt-4">
            {verificationResult.isValid ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <AlertTitle>{verificationResult.isValid ? "Certificado Válido" : "Certificado No Válido"}</AlertTitle>
            <AlertDescription>
              {verificationResult.isValid ? (
                <>
                  Este certificado es auténtico y ha sido verificado en la blockchain de Algorand.
                  <div className="mt-2 space-y-1">
                    <p>
                      <strong>Tipo:</strong> {verificationResult.type}
                    </p>
                    <p>
                      <strong>Fecha de emisión:</strong> {new Date(verificationResult.timestamp).toLocaleString()}
                    </p>
                    <p>
                      <strong>Emisor:</strong> <span className="font-mono text-xs">{verificationResult.issuer}</span>
                    </p>
                  </div>
                </>
              ) : (
                <>
                  Este certificado no se encuentra registrado en la blockchain o ha sido modificado.
                  {verificationResult.error && <p className="mt-2">{verificationResult.error}</p>}
                </>
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  )
}

export default HomePage
