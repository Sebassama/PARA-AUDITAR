"use client"

import React, { useState, useContext } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Award, CheckCircle2, AlertCircle, Plus, Trash2 } from "lucide-react"
import { WalletContext } from "../contexts/WalletContext"
import { generateMD5Hash, registerHashOnBlockchain } from "../utils/hashUtils"

// Grupos académicos disponibles
const academicGroups = [
  "APS (Acción y Proyección Social)",
  "CS (Ciencias de la Salud)",
  "COMSOC (Comunicación Social)",
  "RADIO CLUB",
]

const GroupPage = () => {
  const { address } = useContext(WalletContext)
  const [formData, setFormData] = useState({
    certificateTitle: "",
    eventName: "",
    eventDate: "",
    group: "",
    description: "",
    recipients: [{ name: "", id: "" }],
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [certificates, setCertificates] = useState([])

  // Cargar certificados al montar el componente
  React.useEffect(() => {
    const storedCertificates = JSON.parse(localStorage.getItem("certificates") || "[]")
    // Filtrar solo los certificados emitidos por este usuario
    const userCertificates = storedCertificates.filter((cert) => cert.issuer === address && cert.type === "Certificado")
    setCertificates(userCertificates)
  }, [address])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSelectChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleRecipientChange = (index, field, value) => {
    const updatedRecipients = [...formData.recipients]
    updatedRecipients[index] = { ...updatedRecipients[index], [field]: value }
    setFormData((prev) => ({ ...prev, recipients: updatedRecipients }))
  }

  const addRecipient = () => {
    setFormData((prev) => ({
      ...prev,
      recipients: [...prev.recipients, { name: "", id: "" }],
    }))
  }

  const removeRecipient = (index) => {
    if (formData.recipients.length > 1) {
      const updatedRecipients = [...formData.recipients]
      updatedRecipients.splice(index, 1)
      setFormData((prev) => ({ ...prev, recipients: updatedRecipients }))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Validar campos requeridos
    if (!formData.certificateTitle || !formData.eventName || !formData.eventDate || !formData.group) {
      setResult({
        success: false,
        message: "Por favor, completa todos los campos requeridos.",
      })
      return
    }

    // Validar que al menos un destinatario tenga nombre
    if (!formData.recipients.some((r) => r.name.trim() !== "")) {
      setResult({
        success: false,
        message: "Debes añadir al menos un destinatario con nombre.",
      })
      return
    }

    setIsSubmitting(true)
    setResult(null)

    try {
      const storedCertificates = JSON.parse(localStorage.getItem("certificates") || "[]")
      const newCertificates = []

      // Generar un certificado para cada destinatario
      for (const recipient of formData.recipients) {
        if (recipient.name.trim() === "") continue

        // Crear un objeto con los datos del certificado
        const certificateData = {
          certificateTitle: formData.certificateTitle,
          eventName: formData.eventName,
          eventDate: formData.eventDate,
          group: formData.group,
          description: formData.description,
          recipientName: recipient.name,
          recipientId: recipient.id,
          type: "Certificado",
          issuer: address,
          timestamp: new Date().toISOString(),
        }

        // Generar un hash MD5 de los datos del certificado
        const certString = JSON.stringify(certificateData)
        const certBlob = new Blob([certString], { type: "application/json" })
        const hash = await generateMD5Hash(certBlob)

        // Registrar el hash en la blockchain (simulado)
        const registrationResult = await registerHashOnBlockchain(hash, "Certificado", certificateData)

        // Crear el objeto de certificado para almacenar
        const newCertificate = {
          id: `cert-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          type: "Certificado",
          title: `${formData.certificateTitle} - ${formData.eventName}`,
          recipient: recipient.name,
          issuer: address,
          timestamp: registrationResult.timestamp,
          hash: registrationResult.hash,
          txId: registrationResult.txId,
          metadata: certificateData,
        }

        newCertificates.push(newCertificate)
        storedCertificates.push(newCertificate)
      }

      // Guardar todos los certificados en localStorage
      localStorage.setItem("certificates", JSON.stringify(storedCertificates))

      // Actualizar la lista de certificados en el estado
      setCertificates((prev) => [...prev, ...newCertificates])

      // Mostrar resultado exitoso
      setResult({
        success: true,
        message: `${newCertificates.length} certificados generados exitosamente y registrados en la blockchain de Algorand.`,
        count: newCertificates.length,
      })

      // Limpiar formulario
      setFormData({
        certificateTitle: "",
        eventName: "",
        eventDate: "",
        group: "",
        description: "",
        recipients: [{ name: "", id: "" }],
      })
    } catch (error) {
      console.error("Error al generar los certificados:", error)
      setResult({
        success: false,
        message: "Ocurrió un error al generar los certificados. Por favor, intenta nuevamente.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center">Gestión de Certificados</h1>

        <Tabs defaultValue="create">
          <TabsList className="mb-8 grid w-full grid-cols-2">
            <TabsTrigger value="create">Crear Certificados</TabsTrigger>
            <TabsTrigger value="history">Certificados Emitidos</TabsTrigger>
          </TabsList>

          <TabsContent value="create">
            <Card>
              <CardHeader>
                <CardTitle>Nuevo Certificado</CardTitle>
                <CardDescription>
                  Crea certificados para participantes de cursos, eventos y programas educativos.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleSubmit}>
                <CardContent>
                  <div className="grid gap-6">
                    <div className="grid gap-3">
                      <Label htmlFor="certificateTitle">Título del Certificado</Label>
                      <Input
                        id="certificateTitle"
                        name="certificateTitle"
                        placeholder="Ej: Certificado de Participación"
                        value={formData.certificateTitle}
                        onChange={handleChange}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="grid gap-3">
                        <Label htmlFor="eventName">Nombre del Evento/Curso</Label>
                        <Input
                          id="eventName"
                          name="eventName"
                          placeholder="Ej: Taller de Blockchain"
                          value={formData.eventName}
                          onChange={handleChange}
                        />
                      </div>
                      <div className="grid gap-3">
                        <Label htmlFor="eventDate">Fecha del Evento</Label>
                        <Input
                          id="eventDate"
                          name="eventDate"
                          type="date"
                          value={formData.eventDate}
                          onChange={handleChange}
                        />
                      </div>
                    </div>

                    <div className="grid gap-3">
                      <Label htmlFor="group">Grupo Académico</Label>
                      <Select value={formData.group} onValueChange={(value) => handleSelectChange("group", value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar grupo académico" />
                        </SelectTrigger>
                        <SelectContent>
                          {academicGroups.map((group) => (
                            <SelectItem key={group} value={group}>
                              {group}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-3">
                      <Label htmlFor="description">Descripción</Label>
                      <Textarea
                        id="description"
                        name="description"
                        placeholder="Descripción del certificado o logros alcanzados"
                        value={formData.description}
                        onChange={handleChange}
                        rows={3}
                      />
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label>Destinatarios</Label>
                        <Button type="button" variant="outline" size="sm" onClick={addRecipient}>
                          <Plus className="h-4 w-4 mr-1" /> Añadir
                        </Button>
                      </div>

                      {formData.recipients.map((recipient, index) => (
                        <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end">
                          <div>
                            <Label htmlFor={`name-${index}`}>Nombre</Label>
                            <Input
                              id={`name-${index}`}
                              value={recipient.name}
                              onChange={(e) => handleRecipientChange(index, "name", e.target.value)}
                              placeholder="Nombre completo"
                            />
                          </div>
                          <div>
                            <Label htmlFor={`id-${index}`}>ID/Documento</Label>
                            <Input
                              id={`id-${index}`}
                              value={recipient.id}
                              onChange={(e) => handleRecipientChange(index, "id", e.target.value)}
                              placeholder="Número de identificación"
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeRecipient(index)}
                            disabled={formData.recipients.length <= 1}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    <Award className="mr-2 h-4 w-4" />
                    {isSubmitting ? "Generando..." : "Generar Certificados"}
                  </Button>
                </CardFooter>
              </form>
            </Card>

            {result && (
              <Alert className="mt-8" variant={result.success ? "default" : "destructive"}>
                {result.success ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                <AlertTitle>{result.success ? "Certificados Generados" : "Error"}</AlertTitle>
                <AlertDescription>{result.message}</AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>Certificados Emitidos</CardTitle>
                <CardDescription>Historial de certificados emitidos por este grupo.</CardDescription>
              </CardHeader>
              <CardContent>
                {certificates.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Título</TableHead>
                        <TableHead>Destinatario</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Hash</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {certificates.map((cert) => (
                        <TableRow key={cert.id}>
                          <TableCell>{cert.title}</TableCell>
                          <TableCell>{cert.recipient}</TableCell>
                          <TableCell>{new Date(cert.timestamp).toLocaleString()}</TableCell>
                          <TableCell className="font-mono text-xs truncate max-w-[150px]" title={cert.hash}>
                            {cert.hash}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">No has emitido ningún certificado aún.</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

export default GroupPage
