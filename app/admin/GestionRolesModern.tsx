// app/admin/GestionRolesModern.tsx (COMPATIBLE CON MICROSOFT AUTH)
"use client";

import { useEffect, useState } from "react";
import { useMicrosoftAuth } from "@/hooks/useMicrosoftAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { UserPlus, Trash2, AlertCircle } from "lucide-react";

const ROLES = [
  "Admin",
  "Secretaria",
  "Grupo-APS",
  "Grupo-CS",
  "Grupo-COMSOC",
  "Grupo-Radio"
];

export default function GestionRolesModern() {
  const { session } = useMicrosoftAuth();
  
  const [direccion, setDireccion] = useState("");
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState("Secretaria");
  const [rolesGuardados, setRolesGuardados] = useState<Record<string, { role: string; email: string }>>({});
  const [loading, setLoading] = useState(false);

  // Verificar que el usuario sea Admin
  const isAdmin = session?.role === "Admin";

  useEffect(() => {
    if (isAdmin) {
      obtenerRolesDesdeBD();
    }
  }, [isAdmin]);

  const obtenerRolesDesdeBD = async () => {
    try {
      const res = await fetch('/api/listar-roles');
      if (!res.ok) throw new Error('Error al obtener roles');
      
      const data = await res.json();
      
      // Convertir formato: { wallet1: "role1", wallet2: "role2" }
      // a: { wallet1: { role: "role1", email: "email1" }, ... }
      const formatted: Record<string, { role: string; email: string }> = {};
      
      for (const [wallet, roleOrData] of Object.entries(data)) {
        if (typeof roleOrData === 'string') {
          // Formato antiguo (solo rol)
          formatted[wallet] = { role: roleOrData, email: '' };
        } else if (roleOrData && typeof roleOrData === 'object') {
          // Formato nuevo (objeto con role y email)
          formatted[wallet] = {
            role: (roleOrData as any).role || '',
            email: (roleOrData as any).email || ''
          };
        }
      }
      
      setRolesGuardados(formatted);
    } catch (err) {
      console.error('❌ Error al obtener roles:', err);
    }
  };

  const guardarRol = async () => {
    if (!direccion.trim()) {
      alert('⚠️ Ingresa una dirección de wallet.');
      return;
    }

    if (!email.trim()) {
      alert('⚠️ Ingresa un email institucional.');
      return;
    }

    // Validar formato de email institucional
    if (!email.endsWith('@tesiscerttitlespo.onmicrosoft.com')) {
      alert('⚠️ El email debe ser del dominio @tesiscerttitlespo.onmicrosoft.com');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/guardar-rol', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet: direccion,
          role: rol,
          email: email
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Error al guardar rol');
      }

      await obtenerRolesDesdeBD();
      setDireccion('');
      setEmail('');
      setRol('Secretaria');
      alert('✅ Rol asignado correctamente');
    } catch (err) {
      console.error('❌ Error:', err);
      alert('❌ No se pudo asignar el rol. Revisa la consola.');
    } finally {
      setLoading(false);
    }
  };

  const eliminarRol = async (wallet: string) => {
    if (!confirm(`¿Eliminar el rol de la wallet ${wallet.slice(0, 10)}...?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/eliminar-rol/${wallet}`, {
        method: 'DELETE'
      });
      
      if (!res.ok) throw new Error('Error al eliminar rol');
      
      await obtenerRolesDesdeBD();
      alert('✅ Rol eliminado correctamente');
    } catch (err) {
      console.error('❌ Error al eliminar rol:', err);
      alert('❌ Error al eliminar el rol');
    }
  };

  // Si no es Admin, mostrar mensaje
  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            👥 Gestión de Roles
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Solo el administrador puede gestionar los roles.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          👥 Gestión de Roles
        </CardTitle>
        <CardDescription>
          Asigna roles y emails a las wallets del sistema
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Formulario para agregar usuario */}
        <div className="grid gap-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Input
              placeholder="Dirección de wallet"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              className="md:col-span-2"
            />
            <Input
              type="email"
              placeholder="email@tesiscerttitlespo.onmicrosoft.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="md:col-span-1"
            />
            <Select value={rol} onValueChange={(value) => setRol(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Rol" />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <Button 
            onClick={guardarRol} 
            disabled={loading}
            className="w-full md:w-auto"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            {loading ? 'Guardando...' : 'Asignar Rol'}
          </Button>
        </div>

        {/* Tabla de roles asignados */}
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">Wallet</TableHead>
                <TableHead className="min-w-[250px]">Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(rolesGuardados).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No hay roles asignados
                  </TableCell>
                </TableRow>
              ) : (
                Object.entries(rolesGuardados).map(([wallet, data]) => (
                  <TableRow key={wallet}>
                    <TableCell className="font-mono text-xs" title={wallet}>
                      {wallet.length > 20 
                        ? `${wallet.slice(0, 8)}...${wallet.slice(-6)}`
                        : wallet
                      }
                    </TableCell>
                    <TableCell className="text-sm">
                      {data.email || <span className="text-muted-foreground">Sin email</span>}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-800">
                        {data.role}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        onClick={() => eliminarRol(wallet)}
                        variant="destructive"
                        size="sm"
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Eliminar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Información adicional */}
        <Alert>
          <AlertDescription className="text-sm">
            <strong>Nota:</strong> Todos los usuarios deben tener un email institucional 
            (@tesiscerttitlespo.onmicrosoft.com) para poder autenticarse.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
