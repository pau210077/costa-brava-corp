# Inventario

Se rellena a partir del nivel 0. Sin contraseñas: solo nombres, IPs del laboratorio y funciones.
Estado: **planificado** (aún no existe) · **activo** · **retirado**.

## Servidores y equipos

| Nombre | Tipo | SO | IP | RAM | Función | Usuario habitual | Estado | Caducidad evaluación |
|--------|------|----|----|-----|---------|------------------|--------|----------------------|
| DC01 | VM servidor | Windows Server 2022 Eval | 10.77.0.10 (fija) | 3 GB | Controlador de dominio, DNS, DHCP | - | planificado (nivel 1) | se apunta al instalar (180 días) |
| SRV-LINUX01 | VM servidor | Ubuntu Server LTS | 10.77.0.20 (fija) | 2 GB | Intranet nginx, Samba, GLPI | - | planificado (nivel 2) | no caduca |
| PC01 | VM puesto | Windows 11 Enterprise Eval | DHCP (.100-.199) | 3 GB | Puesto de trabajo de prueba | lgarcia (Contable) | planificado (nivel 1) | se apunta al instalar |

Máximo 3 VMs encendidas a la vez: con las tres, 8 GB de 16 GB.

## Red

| Elemento | Valor |
|----------|-------|
| Red NAT de VirtualBox | `10.77.0.0/24` (nombre: CostaBrava) |
| Dominio de AD | `corp.costabravacorp.es` (NetBIOS `COSTABRAVA`) |
| Puerta de enlace | 10.77.0.1 |
| DNS | 10.77.0.10 (DC01) |
| Rango DHCP | 10.77.0.100 - 10.77.0.199 (lo da DC01) |

Diagrama: [`diagramas/red-nivel-0.md`](diagramas/red-nivel-0.md).

## Servicios cloud

| Servicio | Plan | Coste | Fecha de alta | Fecha de baja prevista |
|----------|------|-------|---------------|------------------------|
| | | 0 € | | |
