# Diseño de Costa Brava Corp

Documento de diseño del nivel 0. Recoge cada decisión, la alternativa descartada y el porqué.
Fuente de los datos de empleados: [`empleados.csv`](empleados.csv).

## 1. Organización

30 personas en 7 departamentos (ver tabla completa en [`docs/plans/nivel-0.md`](../../docs/plans/nivel-0.md)).

| Decisión | Descartado | Por qué |
|----------|------------|---------|
| 7 departamentos con cargos distintos | 5 departamentos grandes | Más realista para una distribuidora (Compras, Marketing) y da más casos de permisos y GPOs. |
| Mozos y repartidores sin PC propio | Un PC por persona | Es lo normal en un almacén. Obliga a pensar en equipos compartidos y licencias distintas (nivel 8). |

## 2. Cuentas de usuario

**Formato:** inicial del nombre + primer apellido, en minúsculas, sin acentos, ñ ni espacios. Máximo 20 caracteres.

| Caso | Regla | Ejemplo |
|------|-------|---------|
| Normal | inicial + apellido1 | Laura García Puig → `lgarcia` |
| Ya existe | + inicial del apellido2 | Lluís García Pons → `lgarciap` |
| Sigue repetido | + número | `lgarcia2` |
| Apellido compuesto | se quitan los espacios | Hassan El Amrani → `helamrani` |

**Descartado:** `nombre.apellido`. Es más legible, pero se eligió el formato corto. El correo de M365 se decidirá en el nivel 8 y puede ser distinto del usuario.

**Límite de 20 caracteres:** es el máximo del nombre de inicio de sesión clásico de Windows (el que va detrás de `COSTABRAVA\`).

**Cuentas de administración:** el técnico de IT tendrá dos cuentas: la normal (`aprats`) para el día a día y una de administrador separada en la OU `Admins` (misión 1.6). Así, si se infecta su sesión normal, el atacante no tiene permisos de administrador.

## 3. Dominio

| Elemento | Valor |
|----------|-------|
| Nombre DNS | `corp.costabravacorp.es` |
| Nombre NetBIOS | `COSTABRAVA` |
| Inicio de sesión | `COSTABRAVA\lgarcia` |

**Descartado:** `costabrava.local`. Microsoft desaconseja los sufijos no registrados como `.local`; recomienda un subdominio de un dominio público de la empresa (ej. `corp.contoso.com`).
En el laboratorio no se compra `costabravacorp.es`: se asume que la empresa ya lo tiene para su web.

**Importante:** el nombre del dominio no se cambia después de crear el controlador de dominio.

## 4. Red

Red NAT de VirtualBox: `10.77.0.0/24` (máscara 255.255.255.0, 254 direcciones).

| IP / rango | Uso | Tipo |
|------------|-----|------|
| 10.77.0.1 | Puerta de enlace (VirtualBox) | Fija |
| 10.77.0.10 | DC01 (también DNS de la red) | Fija |
| 10.77.0.20 | SRV-LINUX01 | Fija |
| 10.77.0.21 - .49 | Servidores futuros (GLPI, Zabbix, Wazuh...) | Fijas |
| 10.77.0.50 - .99 | Impresoras y dispositivos | Fijas |
| 10.77.0.100 - .199 | PCs | DHCP (desde DC01) |
| 10.77.0.200 - .254 | Libres / reserva | - |

**Descartado:** `192.168.x.x` (el de casi todos los routers de casa) y `10.0.2.0/24` (el que trae VirtualBox).
**Por qué este rango:** las VMs están aisladas dentro del PC; solo habría problema si la red externa donde esté el portátil usara el mismo rango. `10.77.0.0/24` es poco habitual.

**DHCP:** lo dará DC01, no VirtualBox. El DHCP integrado de la Red NAT de VirtualBox se desactivará en el nivel 1 para que no haya dos servidores repartiendo IPs.

## 5. Nombres de equipo

Tipo + número: `DC01`, `SRV-LINUX01`, `PC01`, `PC02`... Máximo 15 caracteres (límite de nombre de equipo en Windows).

**Descartado:** nombre por departamento (`VEN-PC01`). Si alguien cambia de departamento, el nombre del equipo dejaría de ser cierto. Quién usa cada PC se apunta en [`docs/inventario.md`](../../docs/inventario.md).

## 6. Estructura de Active Directory (OUs)

```
corp.costabravacorp.es
├─ Domain Controllers        (OU por defecto: aquí se queda DC01)
└─ CostaBrava
   ├─ Usuarios
   │  ├─ Direccion
   │  ├─ Administracion
   │  ├─ Compras
   │  ├─ Ventas
   │  ├─ Marketing
   │  ├─ Logistica
   │  └─ IT
   ├─ Equipos
   │  ├─ Servidores
   │  └─ PCs
   ├─ Grupos
   └─ Admins
```

- Los nombres de las OUs de usuarios coinciden con la columna `Departamento` del CSV, para que el script de altas sepa dónde va cada persona.
- **No se usan los contenedores por defecto `Users` y `Computers`:** no admiten GPOs (verificado en Microsoft Learn).
- **Por qué separar usuarios y equipos:** las GPOs de equipo (ej. bloquear USB) se enlazan a `Equipos\PCs` y no afectan a los servidores; las de usuario (ej. fondo de escritorio) a `Usuarios`.

**Descartado:** una OU por departamento con usuarios y PCs mezclados: obliga a repetir GPOs en cada departamento.

## 7. Grupos

| Tipo | Nombre | Contiene | Para qué |
|------|--------|----------|----------|
| Global | `GG-<Departamento>` (ej. `GG-Ventas`) | Personas del departamento | Agrupar personas |
| Dominio local | `DL-<Recurso>-RW` / `DL-<Recurso>-RO` | Grupos `GG-` | Dar permisos de lectura/escritura o solo lectura a una carpeta |

Modelo AGDLP: cuentas (**A**) en grupos globales (**G**), globales dentro de dominio local (**DL**) y los permisos (**P**) solo a los `DL-`. Se monta en la misión 1.3.

## 8. Seguridad del diseño

- Todos los datos de empleados son inventados.
- Ninguna contraseña en el repositorio: los scripts las pedirán al ejecutarse.
- Contraseñas del laboratorio distintas de cualquier contraseña real.
