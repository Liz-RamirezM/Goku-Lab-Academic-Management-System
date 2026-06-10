# Checklist — Carga inicial Goku Lab

Usar después de ejecutar:

```bash
node server/scripts/limpiarDatos.js --confirm --catalogos
```

Solo debe quedar al menos una cuenta **admin**. Los IDs nuevos empiezan en ALU001, GRU001, CUR001, PROF001.

---

## Antes de empezar

- [ ] Respaldo de MongoDB (`mongodump`)
- [ ] Servidor backend corriendo (`npm run server`)
- [ ] Frontend corriendo (`npm run dev`)
- [ ] Login admin funciona
- [ ] Si no hay admin: `node server/seed.js`

---

## 1. Cursos (`/cursos`)

Catálogo base. Sin cursos no hay grupos.

- [ ] Entrar como **admin** → navbar o Dashboard → **Cursos**
- [ ] Crear cada curso que ofrece Goku Lab (ej. Programación Visual, Matemáticas, Robótica, IA…)
- [ ] Verificar que todos queden en estatus **Activo**
- [ ] Anotar nombres exactos (se usan al crear grupos)

**En BD:** colección `cursos` → `idCurso`, `nombreCurso`, `estatus`

---

## 2. Maestros (`/maestros`)

Cada maestro lleva usuario para ver **solo su calendario**.

- [ ] Ir a **Maestros**
- [ ] Por cada profesor:
  - [ ] Nombre completo
  - [ ] Usuario de acceso (mín. 3 caracteres, ej. `ana.matias`)
  - [ ] Contraseña (mín. 6 caracteres)
- [ ] Confirmar en la lista que aparece `@usuario`
- [ ] Probar login de un maestro: solo calendario, solo sus clases, sin editar

**En BD:** `profesores` + `usuarios` (rol `profesor`, vinculado por `idProfesor`)

---

## 3. Grupos + primer alumno (Dashboard → **Crear nuevo grupo**)

Forma más completa: crea grupo, alumno, inscripción y pago de una vez.

Por cada clase/grupo nuevo:

- [ ] Curso
- [ ] Profesor
- [ ] Día y hora de clase
- [ ] Duración (1 h, 1:30, 2 h…)
- [ ] Capacidad máxima
- [ ] **Desde qué día empieza su clase** (fecha real de inicio en calendario)
- [ ] Alumno (existente o nuevo): nombre, modalidad
- [ ] Mensualidad, día de pago, **primer mes de cobro** (≥ mes de inicio de clases)

- [ ] Revisar en **Calendario** que el grupo aparece **desde la fecha de inicio**, no antes
- [ ] Revisar hora de fin según duración

**En BD:** `grupos`, `alumnos`, `inscripciones`, `pago` (`pagoId` = `ALUxxx-GRUxxx`)

**Nota:** Si ya existe un grupo con mismo curso + día + hora + profesor, el sistema reutiliza el grupo e inscribe al alumno ahí.

---

## 4. Más alumnos en grupos existentes

### Desde calendario
- [ ] Clic en la clase → **Inscribir alumno**
- [ ] Completar datos de pago e inicio de clases

### Desde Alumnos inscritos (`/alumnos`)
- [ ] **Inscribir a curso**
- [ ] Alumno existente o nuevo + grupo/horario + pago

- [ ] Verificar contadores del encabezado (alumnos / cursos dados)
- [ ] Filtrar por curso si hace falta

**En BD:** nueva fila en `inscripciones` + `pago` por cada par alumno–grupo

---

## 5. Pagos (`/pagos`)

Registrar abonos reales.

- [ ] Ir a **Control de pagos**
- [ ] Buscar alumno o filtrar por fechas
- [ ] Registrar pago: monto, método, fecha
- [ ] Verificar estatus (Pendiente / Parcial / Pagado)
- [ ] Generar recibo PDF si aplica

**En BD:** `abonos` (historial) + actualización en `pago`

**Regla:** no inactivar alumno en un grupo si tiene pagos pendientes del periodo vigente.

---

## 6. Calendario (`/dashboard`) — revisión final

- [ ] Todas las clases en día/hora correctos
- [ ] Alumnos visibles desde su `fechaInscripcion`
- [ ] Profesores inactivos marcados en catálogo (no asignar a grupos nuevos)
- [ ] Cursos inactivos igual

### Operaciones posteriores (cuando la base esté estable)
- [ ] Reagendar alumno (desde detalle de clase)
- [ ] Cancelar una fecha específica
- [ ] Editar horario/duración del grupo (detalle de clase → admin)
- [ ] Inactivar alumno en grupo / reactivar (`/alumnos`)

---

## Validación rápida en MongoDB

| Qué comprobar | Esperado |
|---------------|----------|
| `inscripciones` activas | Una por alumno–grupo |
| `pago` | `pagoId` = `{idAlumno}-{grupoId}` en mayúsculas |
| `abonos` | `pagoId` coincide con el pago del alumno |
| `grupos.fechaCreacion` | Fecha desde la que aparece en calendario |
| `inscripciones.fechaInscripcion` | Desde cuándo el alumno aparece en esa clase |
| `inscripciones.diaPago` / `fechaInicioPago` | Cobro (no usar campos viejos `diaPagoFijo` / `fechaPago` en datos nuevos) |

---

## Orden resumido

```
1. Cursos
2. Maestros (+ usuarios)
3. Grupos con alumnos (Nuevo grupo)
4. Más inscripciones
5. Pagos / abonos
6. Revisar calendario
```

---

## Comandos útiles

```bash
# Vista previa de limpieza
node server/scripts/limpiarDatos.js

# Limpieza total (operación + catálogos + solo admin)
node server/scripts/limpiarDatos.js --confirm --catalogos

# Crear admin si hace falta
node server/seed.js

# Crear usuario manual
node server/scripts/crearUsuario.js usuario.clave "Nombre Completo" admin
```
