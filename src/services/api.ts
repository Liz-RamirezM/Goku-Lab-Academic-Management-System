import { notifyDataChanged } from "../utils/dataSync";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = localStorage.getItem("token");
  const headers = new Headers(init?.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    if (typeof window !== "undefined" && window.location.pathname !== "/") {
      window.location.href = "/";
    }
    throw new Error("Sesión expirada. Inicia sesión de nuevo.");
  }

  return res;
}

export const loginService = async (usuario: string, password: string) => {
    const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, password })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al iniciar sesión');
    }

    const data = await response.json();

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));

    return data;
};

export async function getCalendario() {
    const res = await apiFetch("/calendario");
    if (!res.ok) throw new Error("Error al obtener calendario");
    return res.json();
}

export async function getReagendaciones() {
    const res = await apiFetch("/reagendaciones");
    if (!res.ok) throw new Error("Error al obtener reagendaciones");
    return res.json();
}

export async function crearReagendacion(data: any) {
    const res = await apiFetch("/reagendaciones", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
    });

    const responseData = await res.json();

    if (!res.ok) {
        const detalle = responseData.detalle
          ? ` (${responseData.detalle})`
          : "";
        throw new Error(
          (responseData.error || "Error al guardar reagendación") + detalle
        );
    }

    notifyDataChanged({ tipo: "reagendacion" });
    return responseData;
}

export async function getProfesores() {
    const res = await apiFetch("/profesores");
    if (!res.ok) throw new Error("Error al obtener profesores");
    return res.json();
}

export async function crearProfesor(datos: {
    nombre: string;
    usuario: string;
    password: string;
    telefono?: string;
}) {
    const res = await apiFetch("/profesores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error al crear el maestro");

    notifyDataChanged({ tipo: "profesor" });
    return data;
}

export async function renombrarProfesor(
    idProfesor: string,
    datos: { nombre?: string; telefono?: string }
) {
    const res = await apiFetch(`/profesores/${idProfesor}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error al editar el maestro");

    notifyDataChanged({ tipo: "profesor" });
    return data;
}

export async function actualizarEstatusProfesor(
    idProfesor: string,
    estatus: "Activo" | "Inactivo"
) {
    const res = await apiFetch(`/profesores/${idProfesor}/estatus`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estatus }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error al actualizar el maestro");

    notifyDataChanged({ tipo: "profesor" });
    return data;
}

export async function restablecerPasswordProfesor(
    idProfesor: string,
    password: string
) {
    const res = await apiFetch(`/profesores/${idProfesor}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
    });

    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || "Error al restablecer la contraseña");
    }

    return data;
}

export async function eliminarProfesor(idProfesor: string) {
    const res = await apiFetch(`/profesores/${idProfesor}`, {
        method: "DELETE",
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error al dar de baja al maestro");

    notifyDataChanged({ tipo: "profesor" });
    return data;
}

export async function reasignarProfesorGrupo(grupoId: string, idProfesor: string) {
    const res = await apiFetch(`/grupos/${grupoId}/profesor`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idProfesor }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error al reasignar el profesor");

    notifyDataChanged({ tipo: "grupo" });
    return data;
}

export async function getGrupos() {
    const res = await apiFetch("/grupos");
    if (!res.ok) throw new Error("Error al obtener grupos");
    return res.json();
}

export async function getCursos() {
    const res = await apiFetch("/cursos");
    if (!res.ok) throw new Error("Error al obtener cursos");
    return res.json();
}

export async function crearCurso(nombreCurso: string) {
    const res = await apiFetch("/cursos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombreCurso }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error al crear el curso");

    notifyDataChanged({ tipo: "curso" });
    return data;
}

export async function renombrarCurso(idCurso: string, nombreCurso: string) {
    const res = await apiFetch(`/cursos/${idCurso}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombreCurso }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error al editar el curso");

    notifyDataChanged({ tipo: "curso" });
    return data;
}

export async function actualizarEstatusCurso(
    idCurso: string,
    estatus: "Activo" | "Inactivo"
) {
    const res = await apiFetch(`/cursos/${idCurso}/estatus`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estatus }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error al actualizar el curso");

    notifyDataChanged({ tipo: "curso" });
    notifyDataChanged({ tipo: "pago" });
    notifyDataChanged({ tipo: "inscripcion" });
    notifyDataChanged({ tipo: "baja" });
    return data;
}

export async function eliminarCurso(idCurso: string) {
    const res = await apiFetch(`/cursos/${idCurso}`, {
        method: "DELETE",
    });

    const responseData = await res.json();

    if (!res.ok) {
        const lista =
          Array.isArray(responseData.alumnos) && responseData.alumnos.length > 0
            ? `\n${responseData.alumnos
                .map(
                  (a: { nombreAlumno?: string; idAlumno?: string; estatus?: string }) =>
                    `• ${a.nombreAlumno || a.idAlumno}${a.estatus ? ` (${a.estatus})` : ""}`
                )
                .join("\n")}`
            : "";
        throw new Error((responseData.error || "Error al eliminar curso") + lista);
    }

    notifyDataChanged({ tipo: "curso" });
    return responseData;
}

export async function reasignarCursoGrupo(grupoId: string, idCurso: string) {
    const res = await apiFetch(`/grupos/${grupoId}/curso`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idCurso }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error al reasignar el curso");

    notifyDataChanged({ tipo: "grupo" });
    notifyDataChanged({ tipo: "inscripcion" });
    notifyDataChanged({ tipo: "baja" });
    notifyDataChanged({ tipo: "pago" });
    return data;
}

export async function actualizarHorarioGrupo(
    grupoId: string,
    datos: { diaClase: string; horaClase: string; duracionClase?: string }
) {
    const res = await apiFetch(`/grupos/${grupoId}/horario`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error al actualizar el horario");

    notifyDataChanged({ tipo: "grupo" });
    return data;
}

export async function getAlumnos(
  busqueda: string = "",
  opciones?: { soloInscribibles?: boolean }
) {
    const params = new URLSearchParams();
    if (busqueda) params.set("q", busqueda);
    if (opciones?.soloInscribibles) params.set("paraInscripcion", "1");

    const query = params.toString();
    const path = query ? `/alumnos?${query}` : "/alumnos";

    const res = await apiFetch(path);

    if (!res.ok) throw new Error("Error al obtener alumnos");
    return res.json();
}

export async function actualizarAlumno(idAlumno: string, data: {
  nombreAlumno?: string;
  telefono?: string;
  tutor?: string;
  observaciones?: string;
  estatus?: string;
}) {
  const res = await apiFetch(`/alumnos/${idAlumno}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const responseData = await res.json();
  if (!res.ok) {
    throw new Error(responseData.error || "Error al actualizar alumno");
  }
  notifyDataChanged({ tipo: "alumno" });
  return responseData;
}

export async function eliminarAlumno(idAlumno: string) {
  const res = await apiFetch(`/alumnos/${idAlumno}`, {
    method: "DELETE",
  });
  const responseData = await res.json();
  if (!res.ok) {
    const activas = responseData.detalle?.inscripcionesActivas;
    const extra =
      activas != null
        ? ` Tiene ${activas} curso(s) activo(s): usa «Dar de baja» en cada curso primero.`
        : "";
    throw new Error((responseData.error || "Error al eliminar alumno") + extra);
  }

  notifyDataChanged({ tipo: "eliminar-alumno" });
  return responseData;
}

export async function desactivarAlumno(idAlumno: string) {
  const res = await apiFetch(`/alumnos/${idAlumno}/desactivar`, {
    method: "PATCH",
  });
  const responseData = await res.json();
  if (!res.ok) {
    throw new Error(responseData.error || "Error al desactivar alumno");
  }
  notifyDataChanged({ tipo: "alumno" });
  return responseData;
}

export async function crearAlumno(data: {
    nombreAlumno: string;
    telefono?: string;
    tutor?: string;
    observaciones?: string;
    estatus?: string;
}) {
    const res = await apiFetch("/alumnos", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
    });

    const responseData = await res.json();

    if (!res.ok) {
        throw new Error(responseData.error || "Error al crear alumno");
    }

    notifyDataChanged({ tipo: "alumno" });
    return responseData;
}

export async function getInscripciones() {
    const res = await apiFetch("/inscripciones");
    if (!res.ok) throw new Error("Error al obtener inscripciones");
    return res.json();
}

export async function guardarNotasAlumno(data: {
  idAlumno: string;
  observaciones: string;
}) {
  const res = await apiFetch(`/alumnos/${data.idAlumno}/nota`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ observaciones: data.observaciones }),
  });

  const responseData = await res.json();

  if (!res.ok) {
    throw new Error(responseData.error || "Error al guardar la nota del alumno");
  }

  notifyDataChanged({ tipo: "alumno" });
  return responseData;
}

export async function crearInscripcion(data: {
  idAlumno: string;
  nombreAlumno: string;
  grupoId: string;
  modalidad?: string;
  fechaInscripcion?: string;
  montoMensualidad?: number;
  diaPago?: number;
  fechaInicioPago?: string;
  comentarios?: string;
}) {
    const res = await apiFetch("/inscripciones", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
    });

    const responseData = await res.json();

    if (!res.ok) {
        throw new Error(responseData.error || "Error al crear inscripción");
    }

    notifyDataChanged({ tipo: "inscripcion" });
    return responseData;
}

export async function actualizarInscripcionAlumno(
  idAlumno: string,
  grupoId: string,
  data: {
    modalidad?: string;
    comentarios?: string;
    comentarioAlumno?: string;
    montoMensualidad?: number;
  }
) {
  const res = await apiFetch(`/inscripciones/${idAlumno}/${grupoId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const responseData = await res.json();

  if (!res.ok) {
    throw new Error(responseData.error || "Error al actualizar inscripción");
  }

  notifyDataChanged({ tipo: "inscripcion" });
  notifyDataChanged({ tipo: "pago" });
  return responseData;
}

export async function actualizarMontoMensualidad(
  pagoId: string,
  montoMensualidad: number
) {
  const res = await apiFetch(`/pagos/actualizar-monto/${encodeURIComponent(pagoId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ montoMensualidad }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Error al actualizar la mensualidad");
  }

  notifyDataChanged({ tipo: "pago" });
  notifyDataChanged({ tipo: "inscripcion" });
  return data;
}

export async function actualizarMontoInscripcion(
  idAlumno: string,
  grupoId: string,
  montoMensualidad: number
) {
  const res = await actualizarInscripcionAlumno(idAlumno, grupoId, {
    montoMensualidad,
  });
  notifyDataChanged({ tipo: "pago" });
  return res;
}

export async function getInscripcionesPorGrupo(grupoId: string) {
    const res = await apiFetch(`/inscripciones/grupo/${grupoId}`);
    if (!res.ok) throw new Error("Error al obtener inscripciones del grupo");
    return res.json();
}

export async function getInscripcionesPorAlumno(idAlumno: string) {
    const res = await apiFetch(`/inscripciones/alumno/${idAlumno}`);
    if (!res.ok) throw new Error("Error al obtener inscripciones del alumno");
    return res.json();
}

export async function crearGrupoConAlumno(data: {
  /** Desde qué día el alumno aparece en el calendario */
  fechaInscripcion?: string;
  grupo: {
    idCurso?: string;
    nombreCurso: string;
    diaClase: string;
    horaClase: string;
    duracionClase?: string;
    idProfesor?: string;
    nombreProfesor: string;
    comentario?: string;
    comentarioGrupo?: string;
    capacidadMaxima: number;
    fechaCreacion?: string;
    Estatus?: string;
  };
  alumnoExistente?: {
    idAlumno: string;
    nombreAlumno?: string;
    nombre?: string;
    modalidad?: string;
  };
  alumnoNuevo?: {
    nombreAlumno: string;
    telefono?: string;
    tutor?: string;
    observaciones?: string;
    estatus?: string;
    modalidad?: string;
  };
  datosPago?: {
    montoMensualidad: number;
    diaPago: number;
    fechaInicioPago: string;
    comentarios?: string;
  };
}) {
    const res = await apiFetch("/grupos/crear-con-alumno", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
    });

    const responseData = await res.json();

    if (!res.ok) {
        throw new Error(responseData.error || "Error al crear grupo con alumno");
    }

    notifyDataChanged({ tipo: "inscripcion" });
    return responseData;
}

export async function actualizarComentarioGrupo(
    grupoId: string,
    comentario: string
) {
    const res = await apiFetch(`/grupos/${grupoId}/comentario`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ comentario }),
    });

    const responseData = await res.json();

    if (!res.ok) {
        throw new Error(responseData.error || "Error al actualizar comentario del grupo");
    }

    notifyDataChanged({ tipo: "grupo" });
    return responseData;
}

export async function getNotaClaseSesion(grupoId: string, fecha: string) {
    const res = await apiFetch(
        `/notas-clase-sesion/${encodeURIComponent(grupoId)}?fecha=${encodeURIComponent(fecha)}`
    );
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || "Error al obtener la nota de la clase");
    }
    return data;
}

export async function actualizarNotaClaseSesion(
    grupoId: string,
    fecha: string,
    notaHtml: string
) {
    const res = await apiFetch(`/grupos/${encodeURIComponent(grupoId)}/nota-sesion`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha, notaHtml }),
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || "Error al guardar la nota de la clase");
    }
    notifyDataChanged({ tipo: "grupo" });
    return data;
}

export async function getPagosConEstatus() {
    const res = await apiFetch("/pagos/lista-completa");
    if (!res.ok) throw new Error("Error al obtener la lista de pagos");
    return res.json();
}

export async function registrarAbono(data: {
    pagoId: string;
    montoAbono: number;
    nombreAlumno: string;
    metodoAbono: string;
}) {
    const res = await apiFetch("/abonos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Error al registrar el abono");
  }

  const responseData = await res.json();
  notifyDataChanged({ tipo: "pago" });
  return responseData;
}

export async function eliminarReagendacion(id: string) {
    const res = await apiFetch(`/reagendaciones/${id}`, {
        method: "DELETE",
    });

    const responseData = await res.json();

    if (!res.ok) {
        throw new Error(responseData.error || "Error al eliminar reagendación");
    }

    notifyDataChanged({ tipo: "reagendacion" });
    return responseData;
}

export async function eliminarReagendacionAlumno(
  idAlumno: string,
  idGrupoNuevo: string
) {
  const res = await apiFetch(
    `/reagendaciones/alumno/${idAlumno}/${idGrupoNuevo}`,
    {
      method: "DELETE",
    }
  );

    const responseData = await res.json();

    if (!res.ok) {
        throw new Error(responseData.error || "Error al eliminar reagendación");
    }

    notifyDataChanged({ tipo: "reagendacion" });
    return responseData;
}

export async function bajaAlumnoDeGrupo(idAlumno: string, grupoId: string) {
    const res = await apiFetch(`/inscripciones/${idAlumno}/${grupoId}`, {
        method: "DELETE",
    });

    const responseData = await res.json();

    if (!res.ok) {
        const detalle = responseData.detalle;
        let mensaje =
          responseData.error || "Error al dar de baja al alumno";

        if (responseData.detalle && typeof responseData.detalle === "string") {
          mensaje = `${mensaje} (${responseData.detalle})`;
        }

        if (detalle?.saldoPendiente > 0) {
            mensaje = `${mensaje} (saldo: $${Number(detalle.saldoPendiente).toFixed(2)})`;
        }

        throw new Error(mensaje);
    }

    notifyDataChanged({ tipo: "baja" });
    return responseData;
}

export async function eliminarHistorialCursoBaja(
  idAlumno: string,
  grupoId: string
) {
  const res = await apiFetch(
    `/inscripciones/${idAlumno}/${grupoId}/historial`,
    { method: "DELETE" }
  );

  const responseData = await res.json();

  if (!res.ok) {
    throw new Error(
      responseData.error || "Error al eliminar el curso del sistema"
    );
  }

  notifyDataChanged({ tipo: "eliminar-historial-curso" });
  return responseData;
}

export async function reactivarInscripcion(
  idAlumno: string,
  grupoId: string,
  data?: { fechaInicioPago?: string }
) {
    const res = await apiFetch(`/inscripciones/${idAlumno}/${grupoId}/reactivar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data || {}),
    });

    const responseData = await res.json();

    if (!res.ok) {
        throw new Error(responseData.error || "Error al reactivar el curso");
    }

    notifyDataChanged({ tipo: "reactivar" });
    return responseData;
}

export async function eliminarGrupo(grupoId: string) {
    const res = await apiFetch(`/grupos/${grupoId}`, {
        method: "DELETE",
    });

    const responseData = await res.json();

    if (!res.ok) {
        const lista =
          Array.isArray(responseData.alumnos) && responseData.alumnos.length > 0
            ? `\n${responseData.alumnos
                .map(
                  (a: { nombreAlumno?: string; idAlumno?: string }) =>
                    `• ${a.nombreAlumno || a.idAlumno}`
                )
                .join("\n")}`
            : "";
        throw new Error((responseData.error || "Error al eliminar grupo") + lista);
    }

    notifyDataChanged({ tipo: "grupo" });
    return responseData;
}

export const actualizarDiaPago = async (pagoId: string, nuevoDia: number) => {
  const response = await apiFetch(`/pagos/actualizar-dia/${pagoId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ nuevoDia }),
  });

  const responseData = await response.json();

  if (!response.ok) {
    throw new Error(responseData.error || "Error al actualizar día de pago");
  }

  notifyDataChanged({ tipo: "pago" });
  return responseData;
};

export async function getNotificacionesProfesor() {
  const res = await apiFetch("/notificaciones-profesor/mis");
  if (!res.ok) throw new Error("Error al obtener notificaciones");
  return res.json();
}

export async function marcarNotificacionProfesorLeida(notificacionId: string) {
  const res = await apiFetch(
    `/notificaciones-profesor/${encodeURIComponent(notificacionId)}/leida`,
    { method: "PATCH" }
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Error al marcar notificación");
  }
  return data;
}
