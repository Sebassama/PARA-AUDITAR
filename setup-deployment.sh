#!/bin/bash
# setup-deployment.sh
# "Botón de Auto-Reparación" y Despliegue Automatizado
# Uso: ./setup-deployment.sh

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}>>> Iniciando Protocolo de Despliegue Seguro (Tesis)...${NC}"

# Generar certs SSL para HTTPS/WSS (Soporte PeraWallet Mobile)
echo -e "${YELLOW}>>> Verificando Certificados SSL...${NC}"
if [ -f "generate-certs.sh" ]; then
    chmod +x generate-certs.sh
    ./generate-certs.sh
fi

if [ -f "nginx/certs/server.key" ] && [ -f "nginx/certs/server.crt" ]; then
    echo -e "${GREEN}   ✅ Certificados SSL verificados y listos.${NC}"
else
    echo -e "${RED}   ❌ ALERTA: No se encontraron certificados SSL. Nginx fallará en puerto 443.${NC}"
fi

# 1. Verificar Prerrequisitos y Determinar versión de Compose
DOCKER_COMPOSE_CMD=""
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker-compose"
elif docker compose version &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker compose"
else
    echo -e "${RED}[ERROR] No se encontró 'docker-compose' ni 'docker compose'.${NC}"
    echo -e "${YELLOW}Por favor ejecuta: sudo ./install_docker.sh${NC}"
    exit 1
fi

echo -e "${GREEN}>>> Usando comando: $DOCKER_COMPOSE_CMD${NC}"

# 3. Gestión de Secretos (Respetar archivos existentes)
echo -e "${YELLOW}>>> Verificando y blindando archivos de credenciales...${NC}"

if [ -f .env ]; then
    echo -e "${GREEN}   ✅ Archivo .env detectado. Aplicando chmod 600...${NC}"
    chmod 600 .env
fi

if [ -f .env.local ]; then
    echo -e "${GREEN}   ✅ Archivo .env.local detectado. Aplicando chmod 600...${NC}"
    chmod 600 .env.local
fi

if [ -f backend/.env ]; then
    echo -e "${GREEN}   ✅ Archivo backend/.env detectado. Aplicando chmod 600...${NC}"
    chmod 600 backend/.env
fi

if [ ! -f .env ] && [ ! -f .env.local ] && [ ! -f backend/.env ]; then
    echo -e "${RED}[ALERTA] No se detectó ni .env ni .env.local.${NC}"
    echo -e "${YELLOW}El sistema intentará arrancar, pero asegúrate de tener tus variables configuradas.${NC}"
fi

# ... (omitted sections) ...

# 4. Despliegue / Reinicio (Auto-Reparación)
echo -e "${YELLOW}>>> Deteniendo contenedores antiguos (si existen)...${NC}"
$DOCKER_COMPOSE_CMD down

echo -e "${YELLOW}>>> Construyendo (Build) y Levantando el Sistema Blindado...${NC}"
echo -e "    * Optimizando Frontend..."
echo -e "    * Configurando Firewall Nginx..."
echo -e "    * Conectando a Base de Datos Externa..."

# Ejecutar Docker Compose en segundo plano
$DOCKER_COMPOSE_CMD up -d --build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}=================================================${NC}"
    echo -e "${GREEN}   ✅ SISTEMA DESPLEGADO CORRECTAMENTE   ${NC}"
    echo -e "${GREEN}=================================================${NC}"
    echo -e "${YELLOW}Estado de los Módulos:${NC}"
    $DOCKER_COMPOSE_CMD ps
    echo -e ""
    echo -e "${GREEN}>>> Accede a la aplicación en: http://localhost (o la IP de la VM)${NC}"
else
    echo -e "${RED}[FALLO] Algo salió mal durante el despliegue. Revisa los logs.${NC}"
    exit 1
fi
