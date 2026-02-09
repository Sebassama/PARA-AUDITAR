#!/bin/bash
# install_docker.sh
# Script de Ayuda: Instalación de Docker y Docker Compose en Ubuntu/Debian
# Ejecutar con sudo: sudo ./install_docker.sh
set -e # Detener script si hay error

# Verificar si es root
if [ "$EUID" -ne 0 ]; then
  echo "❌ Error: Por favor ejecuta este script con SUDO o como ROOT."
  echo "   Uso: sudo ./install_docker.sh"
  exit 1
fi

echo ">>> Actualizando lista de paquetes..."
apt-get update

echo ">>> Instalando dependencias básicas..."
apt-get install -y ca-certificates curl gnupg lsb-release

echo ">>> Agregando llave GPG oficial de Docker..."
mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg

echo ">>> Configurando repositorio estable..."
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

echo ">>> Instalando Docker Engine..."
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

echo ">>> Instalando Docker Compose (Standalone)..."
apt-get install -y docker-compose-plugin

echo ">>> Iniciando servicio Docker..."
service docker start

echo ">>> Verificando instalación..."
docker --version
docker compose version

echo "========================================="
echo "✅ Docker instalado correctamente."
echo "⚠️  IMPORTANTE: Cierra sesión y vuelve a entrar, o ejecuta:"
echo "    newgrp docker"
echo "Para poder usar docker sin 'sudo'."
echo "========================================="
