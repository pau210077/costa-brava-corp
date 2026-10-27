# Plan del nivel 0: Diseño de la empresa

## Decisiones

### Empresa
Costa Brava Corp, distribuidora de material de hostelería (Blanes). 30 personas.

| Departamento   | Pers. | Cargos |
|----------------|------:|--------|
| Dirección      | 2 | Gerente, Director comercial |
| Administración | 5 | Resp. administración, 2 contables, Técnico RRHH, Recepcionista |
| Compras        | 3 | Jefe de compras, 2 compradores |
| Ventas         | 8 | Jefe de ventas, 5 comerciales, 2 atención al cliente |
| Marketing      | 2 | Resp. marketing, Diseñador gráfico |
| Logística      | 9 | Jefe de almacén, 5 mozos, 2 repartidores, Administrativo de logística |
| IT             | 1 | Técnico de sistemas |

Mozos y repartidores no tienen PC propio.

### Usuarios
- Formato: inicial del nombre + primer apellido (`lgarcia`).
- Si se repite: + inicial del segundo apellido (`lgarciap`); si aún se repite, número (`lgarcia2`).
- Minúsculas, sin acentos ni ñ, máximo 20 caracteres.

### Dominio
- DNS: `corp.costabravacorp.es` (subdominio de un dominio público, como recomienda Microsoft; no `.local`).
- NetBIOS: `COSTABRAVA`.

### Red (Red NAT de VirtualBox)
| IP / rango       | Uso |
|------------------|-----|
| 10.77.0.1        | Puerta de enlace |
| 10.77.0.10       | DC01 |
| 10.77.0.20       | SRV-LINUX01 |
| 10.77.0.21-49    | Servidores futuros |
| 10.77.0.50-99    | Impresoras y dispositivos fijos |
| 10.77.0.100-199  | DHCP para PCs |

Rango poco habitual para no chocar con redes externas al mover el portátil.

### Nombres de equipo
Tipo + número: `DC01`, `SRV-LINUX01`, `PC01`, `PC02`... Máximo 15 caracteres.

### OUs
```
CostaBrava
├─ Usuarios
│  ├─ Direccion, Administracion, Compras
│  └─ Ventas, Marketing, Logistica, IT
├─ Equipos
│  ├─ Servidores
│  └─ PCs
├─ Grupos
└─ Admins
```

- DC01 se queda en la OU `Domain Controllers` (no se mueve).
- Nada en los contenedores `Users` y `Computers`: no admiten GPOs.

### Grupos
- `GG-<Departamento>`: un grupo global por departamento con sus personas.
- `DL-<Recurso>-RW` / `DL-<Recurso>-RO`: permisos de carpetas (misión 1.3, AGDLP).

### CSV de empleados
- Archivo: `niveles/nivel-0/empleados.csv`, separador coma, UTF-8.
- Columnas: Nombre, Apellido1, Apellido2, Usuario, Departamento, Cargo, Responsable, Extension, TienePC, FechaAlta.
- Datos inventados; ninguno real.

## Misiones

| Misión | Qué | Entregable | Comprobación |
|--------|-----|------------|--------------|
| 0.1 | CSV de 30 empleados | `niveles/nivel-0/empleados.csv` | 30 filas, usuarios sin repetir |
| 0.2 | Documento de diseño | `niveles/nivel-0/diseno.md` | Todas las decisiones y su porqué |
| 0.3 | Diagrama e inventario | `docs/diagramas/red-nivel-0.md`, `docs/inventario.md` | El diagrama se ve en GitHub |
| 0.4 | Repo en GitHub | Repo subido | Revisar que no hay secretos antes del push |
| 0.5 | Descargas y comprobaciones | ISOs descargadas | Virtualización activa, espacio en disco, RAM |

## Fuera de alcance
No se crea ninguna VM en este nivel.
