"use client"

import { useState, useContext } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { FileText, CheckCircle2, AlertCircle } from "lucide-react"
import { WalletContext } from "../contexts/WalletContext"
import { generateMD5Hash, registerHashOnBlockchain } from "../utils/hashUtils"

// Datos de facultades y carreras
const facultiesAndCareers = {
  Ingeniería: ["Ingeniería Informática", "Ingeniería Civil", "Ingeniería Eléctrica", "Ingeniería Mecánica"],
  Ciencias: ["Física", "Química", "Matemáticas", "Biología"],
  Humanidades: ["Historia", "Filosofía", "Literatura", "Antropología"],
  Medicina: ["Medicina General", "Enfermería", "Odontología", "Fisioterapia"],
  Economía: ["Administración de Empresas", "Contabilidad", "Economía", "Marketing"],
}

const SecretaryPage = () => {
  const { address } = useContext(WalletContext)
  const [formData, setFormData] = useState({
    title: "",
    studentName: "",
    studentId: "",
    faculty: "",
    career: "",
    issueDate: "",
    additionalInfo: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [careers, setCareers] = useState([])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSelectChange = (name, value) => {
    if (name === "faculty") {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
        career: "", // Reset career when faculty changes
      }))
      setCareers(facultiesAndCareers[value] || [])
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Validar campos requeridos
    if (
      !formData.title ||
      !formData.studentName ||
      !formData.studentId ||
      !formData.faculty ||
      !formData.career ||
      !formData.issueDate
    ) {
      setResult({
        success: false,
        message: "Por favor, completa todos los campos requeridos.",
      })
      return
    }

    setIsSubmitting(true)
    setResult(null)

    try {
      // Crear un objeto con los datos del título
      const titleData = {
        ...formData,
        type: "Título",
        issuer: address,
        timestamp: new Date().toISOString(),
      }

      // Generar un hash MD5 de los datos del título
      const titleString = JSON.stringify(titleData)
      const titleBlob = new Blob([titleString], { type: "application/json" })
      const hash = await generateMD5Hash(titleBlob)

      // Registrar el hash en la blockchain (simulado)
      const registrationResult = await registerHashOnBlockchain(hash, "Título", titleData)

      // Guardar el certificado en localStorage
      const storedCertificates = JSON.parse(localStorage.getItem("certificates") || "[]")
      const newCertificate = {
        id: `title-${Date.now()}`,
        type: "Título",
        title: `${formData.title} en ${formData.career}`,
        recipient: formData.studentName,
        issuer: address,
        timestamp: registrationResult.timestamp,
        hash: registrationResult.hash,
        txId: registrationResult.txId,
        metadata: titleData,
      }

      storedCertificates.push(newCertificate)
      localStorage.setItem("certificates", JSON.stringify(storedCertificates))

      // Mostrar resultado exitoso
      setResult({
        success: true,
        message: "Título generado exitosamente y registrado en la blockchain de Algorand.",
        hash: registrationResult.hash,
        txId: registrationResult.txId,
      })

      // Limpiar formulario
      setFormData({
        title: "",
        studentName: "",
        studentId: "",
        faculty: "",
        career: "",
        issueDate: "",
        additionalInfo: "",
      })
      setCareers([])
    } catch (error) {
      console.error("Error al generar el título:", error)
      setResult({
        success: false,
        message: "Ocurrió un error al generar el título. Por favor, intenta nuevamente.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center">Generación de Títulos Académicos</h1>

        <Card>
          <CardHeader>
            <CardTitle>Nuevo Título Académico</CardTitle>
            <CardDescription>
              Complete la información para generar un nuevo título académico que será registrado en la blockchain.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent>
              <div className="grid gap-6">
                <div className="grid gap-3">
                  <Label htmlFor="title">Tipo de Título</Label>
                  <Select value={formData.title} onValueChange={(value) => handleSelectChange("title", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar tipo de título" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Licenciatura">Licenciatura</SelectItem>
                      <SelectItem value="Maestría">Maestría</SelectItem>
                      <SelectItem value="Doctorado">Doctorado</SelectItem>
                      <SelectItem value="Diplomado">Diplomado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="grid gap-3">
                    <Label htmlFor="studentName">Nombre del Estudiante</Label>
                    <Input
                      id="studentName"
                      name="studentName"
                      placeholder="Nombre completo"
                      value={formData.studentName}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="grid gap-3">
                    <Label htmlFor="studentId">ID del Estudiante</Label>
                    <Input
                      id="studentId"
                      name="studentId"
                      placeholder="Número de identificación"
                      value={formData.studentId}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="grid gap-3">
                    <Label htmlFor="faculty">Facultad</Label>
                    <Select value={formData.faculty} onValueChange={(value) => handleSelectChange("faculty", value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar facultad" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(facultiesAndCareers).map((faculty) => (
                          <SelectItem key={faculty} value={faculty}>
                            {faculty}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-3">
                    <Label htmlFor="career">Carrera</Label>
                    <Select
                      value={formData.career}
                      onValueChange={(value) => handleSelectChange("career", value)}
                      disabled={!formData.faculty}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={formData.faculty ? "Seleccionar carrera" : "Primero selecciona una facultad"}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {careers.map((career) => (
                          <SelectItem key={career} value={career}>
                            {career}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-3">
                  <Label htmlFor="issueDate">Fecha de Emisión</Label>
                  <Input
                    id="issueDate"
                    name="issueDate"
                    type="date"
                    value={formData.issueDate}
                    onChange={handleChange}
                  />
                </div>

                <div className="grid gap-3">
                  <Label htmlFor="additionalInfo">Información Adicional</Label>
                  <Textarea
                    id="additionalInfo"
                    name="additionalInfo"
                    placeholder="Detalles adicionales sobre el título"
                    value={formData.additionalInfo}
                    onChange={handleChange}
                    rows={3}
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                <FileText className="mr-2 h-4 w-4" />
                {isSubmitting ? "Generando..." : "Generar Título"}
              </Button>
            </CardFooter>
          </form>
        </Card>

        {result && (
          <Alert className="mt-8" variant={result.success ? "default" : "destructive"}>
            {result.success ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <AlertTitle>{result.success ? "Título Generado" : "Error"}</AlertTitle>
            <AlertDescription>
              {result.message}
              {result.hash && (
                <div className="mt-2">
                  <p className="font-semibold">Hash de transacción:</p>
                  <code className="block p-2 bg-muted rounded-md text-xs font-mono mt-1 break-all">{result.hash}</code>
                </div>
              )}
              {result.txId && (
                <div className="mt-2">
                  <p className="font-semibold">ID de transacción:</p>
                  <code className="block p-2 bg-muted rounded-md text-xs font-mono mt-1">{result.txId}</code>
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  )
}

export default SecretaryPage
