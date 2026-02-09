"use client"

import { useState, useEffect, useContext } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Search, UserPlus, Trash2, FileText, Award, CheckCircle2, AlertCircle } from "lucide-react"
import { WalletContext } from "../contexts/WalletContext"

const AdminPage = () => {
  const { address } = useContext(WalletContext)
  const [searchTerm, setSearchTerm] = useState("")
  const [users, setUsers] = useState([])
  const [newUserAddress, setNewUserAddress] = useState("")
  const [newUserRole, setNewUserRole] = useState("")
  const [alert, setAlert] = useState(null)
  const [certificates, setCertificates] = useState([])

  // Cargar usuarios y roles desde localStorage
  useEffect(() => {
    const rolesWallet = JSON.parse(localStorage.getItem("rolesWallet") || "{}")
    const usersArray = Object.entries(rolesWallet).map(([address, role]) => ({
      address,
      role,
    }))
    setUsers(usersArray)

    // Cargar certificados desde localStorage
    const storedCertificates = JSON.parse(localStorage.getItem("certificates") || "[]")
    setCertificates(storedCertificates)
  }, [])

  const handleAddUser = () => {
    if (!newUserAddress || !newUserRole) {
      setAlert({
        type: "error",
        message: "Por favor, ingresa una dirección de wallet y selecciona un rol.",
      })
      return
    }

    // Validar formato de dirección (simplificado para demo)
    if (!newUserAddress.startsWith("ALGO") || newUserAddress.length < 10) {
      setAlert({
        type: "error",
        message: "La dirección de wallet no tiene un formato válido.",
      })
      return
    }

    // Verificar si la dirección ya existe
    if (users.some((user) => user.address === newUserAddress)) {
      setAlert({
        type: "error",
        message: "Esta dirección ya tiene un rol asignado.",
      })
      return
    }

    // Añadir nuevo usuario
    const updatedUsers = [...users, { address: newUserAddress, role: newUserRole }]
    setUsers(updatedUsers)

    // Actualizar localStorage
    const rolesWallet = JSON.parse(localStorage.getItem("rolesWallet") || "{}")
    rolesWallet[newUserAddress] = newUserRole
    localStorage.setItem("rolesWallet", JSON.stringify(rolesWallet))

    // Limpiar campos y mostrar alerta de éxito
    setNewUserAddress("")
    setNewUserRole("")
    setAlert({
      type: "success",
      message: "Usuario añadido correctamente.",
    })

    // Limpiar alerta después de 3 segundos
    setTimeout(() => setAlert(null), 3000)
  }

  const handleUpdateRole = (address, newRole) => {
    // Actualizar rol en el estado
    const updatedUsers = users.map((user) => (user.address === address ? { ...user, role: newRole } : user))
    setUsers(updatedUsers)

    // Actualizar localStorage
    const rolesWallet = JSON.parse(localStorage.getItem("rolesWallet") || "{}")
    rolesWallet[address] = newRole
    localStorage.setItem("rolesWallet", JSON.stringify(rolesWallet))

    setAlert({
      type: "success",
      message: "Rol actualizado correctamente.",
    })

    // Limpiar alerta después de 3 segundos
    setTimeout(() => setAlert(null), 3000)
  }

  const handleDeleteUser = (addressToDelete) => {
    // No permitir eliminar al usuario actual
    if (addressToDelete === address) {
      setAlert({
        type: "error",
        message: "No puedes eliminar tu propio usuario.",
      })
      return
    }

    // Eliminar usuario del estado
    const updatedUsers = users.filter((user) => user.address !== addressToDelete)
    setUsers(updatedUsers)

    // Actualizar localStorage
    const rolesWallet = JSON.parse(localStorage.getItem("rolesWallet") || "{}")
    delete rolesWallet[addressToDelete]
    localStorage.setItem("rolesWallet", JSON.stringify(rolesWallet))

    setAlert({
      type: "success",
      message: "Usuario eliminado correctamente.",
    })

    // Limpiar alerta después de 3 segundos
    setTimeout(() => setAlert(null), 3000)
  }

  // Filtrar certificados según término de búsqueda
  const filteredCertificates = certificates.filter(
    (cert) =>
      cert.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cert.recipient.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cert.hash.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-8">Panel de Administración</h1>

      {alert && (
        <Alert variant={alert.type === "success" ? "default" : "destructive"} className="mb-6">
          {alert.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <AlertTitle>{alert.type === "success" ? "Éxito" : "Error"}</AlertTitle>
          <AlertDescription>{alert.message}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="users">
        <TabsList className="mb-8">
          <TabsTrigger value="users">Gestión de Usuarios</TabsTrigger>
          <TabsTrigger value="certificates">Historial de Certificados</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>Usuarios y Roles</CardTitle>
              <CardDescription>Administra los usuarios del sistema y asigna roles específicos.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-8 p-4 border rounded-lg">
                <h3 className="text-lg font-medium mb-4">Añadir Nuevo Usuario</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="wallet-address">Dirección de Wallet</Label>
                    <Input
                      id="wallet-address"
                      placeholder="ALGO..."
                      value={newUserAddress}
                      onChange={(e) => setNewUserAddress(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Rol</Label>
                    <Select value={newUserRole} onValueChange={setNewUserRole}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar rol" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="secretaria">Secretaría</SelectItem>
                        <SelectItem value="grupo">Grupo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button onClick={handleAddUser}>
                      <UserPlus className="mr-2 h-4 w-4" /> Añadir Usuario
                    </Button>
                  </div>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dirección de Wallet</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.address}>
                      <TableCell className="font-mono text-xs">{user.address}</TableCell>
                      <TableCell>
                        <Select
                          defaultValue={user.role}
                          onValueChange={(value) => handleUpdateRole(user.address, value)}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Administrador</SelectItem>
                            <SelectItem value="secretaria">Secretaría</SelectItem>
                            <SelectItem value="grupo">Grupo</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleDeleteUser(user.address)}
                            disabled={user.address === address}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="certificates">
          <Card>
            <CardHeader>
              <CardTitle>Historial de Certificados y Títulos</CardTitle>
              <CardDescription>Visualiza todos los certificados y títulos emitidos en la plataforma.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Buscar por título, destinatario o hash..."
                    className="pl-8"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              {filteredCertificates.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Título</TableHead>
                      <TableHead>Destinatario</TableHead>
                      <TableHead>Emisor</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Hash</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCertificates.map((cert) => (
                      <TableRow key={cert.id}>
                        <TableCell>
                          {cert.type === "Título" ? <FileText className="h-4 w-4" /> : <Award className="h-4 w-4" />}{" "}
                          {cert.type}
                        </TableCell>
                        <TableCell>{cert.title}</TableCell>
                        <TableCell>{cert.recipient}</TableCell>
                        <TableCell className="font-mono text-xs truncate max-w-[100px]" title={cert.issuer}>
                          {cert.issuer.substring(0, 6)}...{cert.issuer.substring(cert.issuer.length - 4)}
                        </TableCell>
                        <TableCell>{new Date(cert.timestamp).toLocaleString()}</TableCell>
                        <TableCell className="font-mono text-xs truncate max-w-[150px]" title={cert.hash}>
                          {cert.hash}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">No se encontraron certificados.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default AdminPage
