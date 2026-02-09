#!/bin/bash
IPNS_KEY="${IPFS_INDEX_IPNS_KEY:-k51qzi5uqu5dhonp113olftb52kmnb3vo9nvyc20910k7nk1pgurprtwp3b0sb}"
LOG_FILE="/var/log/ipfs-index-sync.log"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"; }

log "=========================================="
log "🔄 Iniciando sincronización de índice IPFS (IPNS→cluster)"

# Esperar IPFS
log "⏳ Esperando a que IPFS esté listo..."
for i in {1..10}; do
  if ipfs id >/dev/null 2>&1; then log "✅ IPFS listo (intento $i/10)"; break; fi
  [ $i -eq 10 ] && log "❌ IPFS no respondió, abortando" && exit 1
  sleep 3
done
sleep 2

# --- PROTECCIÓN WRITER ---
# Verificar si este nodo posee la clave privada del IPNS.
# Si la tiene, este nodo es el "Writer" (Autoridad) y NO debe sobrescribir su estado local
# con lo que haya en IPNS (que podría ser viejo), ya que él es quien publica lo nuevo.
if ipfs key list -l | grep -q "$IPNS_KEY"; then
  log "🛡️  Este nodo es el WRITER (posee la clave $IPNS_KEY)."
  log "🛑 Abortando sincronización para evitar sobrescribir cambios locales pendientes de publicación."
  log "=========================================="
  exit 0
fi
# -------------------------

TARGET_CID=""

# 1) IPNS primero (root más reciente publicado)
IPNS_CID=$(ipfs name resolve /ipns/$IPNS_KEY 2>/dev/null | grep -oP '/ipfs/\K\w+')
if [ -n "$IPNS_CID" ]; then
  log "✅ IPNS resuelto: $IPNS_CID"
  TARGET_CID=$IPNS_CID
else
  log "⚠️ IPNS no disponible, intentando cluster..."
  CLUSTER_CID=$(ipfs-cluster-ctl pin ls --filter name=cert-index-root 2>/dev/null | awk '/cert-index-root/ {print $1; exit}')
  if [ -n "$CLUSTER_CID" ]; then
    log "✅ Cluster CID: $CLUSTER_CID"
    TARGET_CID=$CLUSTER_CID
  fi
fi

if [ -z "$TARGET_CID" ]; then
  log "⚠️ No CID ni en IPNS ni en cluster; creando /cert-index vacío"
  ipfs files mkdir -p /cert-index/by-hash /cert-index/by-owner
  log "=========================================="; exit 0
fi

LOCAL_CID=$(ipfs files stat /cert-index --hash 2>/dev/null | head -n1)
if [ "$LOCAL_CID" == "$TARGET_CID" ]; then
  log "✅ Índice ya sincronizado (CID: $LOCAL_CID)"
  log "=========================================="; exit 0
fi

log "🔄 Sincronizando índice:"
log "   Local:  ${LOCAL_CID:-vacío}"
log "   Target: $TARGET_CID"

if ipfs files stat /cert-index >/dev/null 2>&1; then
  BACKUP_PATH="/cert-index-backup-$(date +%s)"
  ipfs files cp /cert-index $BACKUP_PATH 2>/dev/null && log "📦 Backup: $BACKUP_PATH"
fi

ipfs files rm -r /cert-index 2>/dev/null
if ipfs files cp /ipfs/$TARGET_CID /cert-index 2>/dev/null; then
  log "✅ Índice actualizado correctamente"
else
  log "❌ Error al copiar índice desde $TARGET_CID"
  exit 1
fi

log "=========================================="
log "✅ Sincronización completada"
log "=========================================="






