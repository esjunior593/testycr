const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const axios = require('axios');
const moment = require('moment-timezone'); // Importar Moment.js con soporte de zona horaria
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

// Conexión a MySQL usando variables de entorno
const db = mysql.createPool({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    port: process.env.MYSQL_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// **No necesitas hacer `db.connect()`, el pool maneja las conexiones automáticamente**
setInterval(() => {
    db.getConnection((err, connection) => {
        if (err) {
            console.error("❌ Error obteniendo conexión de MySQL:", err);
            return;
        }
        connection.ping((err) => {
            if (err) {
                console.error("❌ Error en el ping de MySQL:", err);
            } else {
                console.log("✅ Conexión con MySQL sigue activa");
            }
            connection.release(); // **Liberar la conexión después del ping**
        });
    });
}, 300000); // Cada 5 minutos


function extraerDatosOCR(text) {
     // Inicializar todas las variables
     let numero = "-", nombres = "-", monto = "-", fecha = "-", banco = "DESCONOCIDO";

     console.log("Texto OCR extraído:", text); // Depuración para ver el texto sin procesar
 
     // **🔴 Verificar si el texto NO parece ser un comprobante de pago**
     const palabrasClave = [
         "banco", "transferencia", "no.", "valor debitado", "comisión", "fecha",
         "monto", "depósito", "referencia", "ha enviado $", "número de comprobante",
         "cuenta", "institución financiera", "pago recibido", "transacción"
     ];
 
     // Convertimos todo el texto a minúsculas para evitar errores de comparación
     let textoMinuscula = text ? text.toLowerCase() : ""; 
     let esComprobante = palabrasClave.some(palabra => textoMinuscula.includes(palabra));
 
     // **Si el texto no parece ser un comprobante, retorna el mensaje de soporte**
     if (!esComprobante) {
         console.log("🚫 No se detectó un comprobante de pago en la imagen.");
         return {
             message: "Si tiene algún problema con su servicio escriba al número de Soporte por favor.",
             resumen: "👉 *Soporte:* 0980757208 👈"
         };
     }



    // Detectar el banco
    if (text.includes("BANCO INTERNACIONAL")) {
        banco = "BANCO INTERNACIONAL";
        const comprobanteRegex = /No\. Comprobante\s*(\d+)/i;
        const nombresRegex = /Nombre\s*([A-Za-z\s]+)/i;
        const montoRegex = /Monto\s*\$?(\d+[\.,]\d{2})/i;
        const fechaRegex = /Fecha y Hora\s*(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2})/i;

        numero = text.match(comprobanteRegex) ? text.match(comprobanteRegex)[1].trim() : "-";
        nombres = text.match(nombresRegex) ? text.match(nombresRegex)[1].trim() : "-";
        monto = text.match(montoRegex) ? text.match(montoRegex)[1] : "-";
        fecha = text.match(fechaRegex) 
            ? moment(text.match(fechaRegex)[1], "DD/MM/YYYY HH:mm:ss").format("DD MMM. YYYY HH:mm") 
            : moment().tz("America/Guayaquil").format("DD MMM. YYYY HH:mm");
    } 
     // 🔹 NUEVO COMPROBANTE DE TRANSFERENCIA - BANCO DEL PACÍFICO
// 🔹 NUEVO COMPROBANTE DE TRANSFERENCIA - BANCO DEL PACÍFICO (INTERMÁTICO)
else if (/Transferencias internas/i.test(text) && /Intermático/i.test(text)) {
    console.log("📌 Detectado NUEVA TRANSFERENCIA - BANCO DEL PACÍFICO (INTERMÁTICO)");

    banco = "TRANSFERENCIA - BANCO DEL PACÍFICO (INTERMÁTICO)";

    // 📌 Expresiones regulares mejoradas para extraer los datos
    const fechaHoraRegex = /Intermático - Fecha - (\d{4}-\d{2}-\d{2}) - Hora (\d{2}:\d{2}:\d{2})/i;
    const montoRegex = /VALOR\s+([\d,\.]+)/i;
    const nombresRegex = /A NOMBRE DE\s+([A-Za-z\s]+)/i;

    // 📌 Extraer fecha y hora como número de documento
    let matchFechaHora = text.match(fechaHoraRegex);
    numero = matchFechaHora ? `${matchFechaHora[1]} ${matchFechaHora[2]}` : "-";

    // 📌 Extraer monto correctamente
    let matchMonto = text.match(montoRegex);
    monto = matchMonto ? matchMonto[1].replace(",", ".") : "-";

    // 📌 Extraer nombres correctamente
    let matchNombres = text.match(nombresRegex);
    nombres = matchNombres ? matchNombres[1].trim() : "-";

    // 📌 Formatear fecha correctamente
    fecha = matchFechaHora 
        ? moment(`${matchFechaHora[1]} ${matchFechaHora[2]}`, "YYYY-MM-DD HH:mm:ss").format("DD MMM. YYYY HH:mm") 
        : moment().tz("America/Guayaquil").format("DD MMM. YYYY HH:mm");

    console.log("📥 Datos extraídos:", { numero, nombres, monto, fecha, banco });
}
    else if (/RUC CNB/i.test(text) || (/DEPÓSITO/i.test(text) && /CUENTA DE AHORROS/i.test(text))) {
        console.log("📌 Detectado DEPÓSITO - BANCO PICHINCHA");
        banco = "DEPÓSITO - BANCO PICHINCHA";
    
        // 🛠 Expresiones Regulares Mejoradas
        const comprobanteRegex = /Documento\.*\s*[:;]?\s*(\d+)/i;
        const nombresRegex = /Nombre CNB\.*[:;]\s*([\w\s]+)/i;
        const montoRegex = /Efectivo\.*[:;]\s*\$?\s*([\d,\.]+)/i;
        const fechaRegex = /Fecha\.*[:;]\s*(\d{4})\/([a-zA-Z]+)\/(\d{2})\s+(\d{2}:\d{2})/i;
    
        // 📌 Extraer número de comprobante correctamente desde "Documento.: 007645"
        const numeroMatch = text.match(comprobanteRegex);
        if (numeroMatch) {
            numero = numeroMatch[1].trim().padStart(6, '0');  // Asegurar que mantiene los ceros
        } else {
            numero = "-";
        }
    
        // 📌 Extraer nombre correcto sin "RUC CNB"
        const nombresMatch = text.match(nombresRegex);
        nombres = nombresMatch ? nombresMatch[1].trim().replace(/\s*RUC CNB.*/i, '') : "-";
    
        // 📌 Extraer monto correctamente
        const montoMatch = text.match(montoRegex);
        monto = montoMatch ? montoMatch[1].trim() : "-";
    
        // 📌 Extraer fecha correctamente y formatearla
        let matchFecha = text.match(fechaRegex);
        if (matchFecha) {
            const meses = {
                "ene": "Enero", "feb": "Febrero", "mar": "Marzo", "abr": "Abril",
                "may": "Mayo", "jun": "Junio", "jul": "Julio", "ago": "Agosto",
                "sep": "Septiembre", "oct": "Octubre", "nov": "Noviembre", "dic": "Diciembre"
            };
            fecha = `${matchFecha[3]} ${meses[matchFecha[2].toLowerCase()]} ${matchFecha[1]} ${matchFecha[4]}`;
        } else {
            fecha = moment().tz("America/Guayaquil").format("DD MMM. YYYY HH:mm");
        }
    
        console.log("📥 Datos extraídos:", { numero, nombres, monto, fecha, banco });
    }
    
    
    
    // Banco de Loja
    else if (/BANCO DE LOJA/i.test(text)) {
        banco = "BANCO DE LOJA";
    
        const comprobanteRegex = /Nro\. comprobante:\s*(\d+)/i;
        const montoRegex = /Monto transferido\s*\$?([\d,\.]+)/i;
        const fechaRegex = /(\d{2}\/\d{2}\/\d{4})/i;
    
        // Extraer datos
        numero = text.match(comprobanteRegex) ? text.match(comprobanteRegex)[1].trim() : "-";
        monto = text.match(montoRegex) ? text.match(montoRegex)[1].replace(",", ".") : "-";
        
        // Extraer y formatear fecha correctamente
        fecha = text.match(fechaRegex) 
            ? moment(text.match(fechaRegex)[1], "DD/MM/YYYY").format("DD MMM. YYYY") 
            : moment().tz("America/Guayaquil").format("DD MMM. YYYY HH:mm");
    }
    // 🔹 JEP MÓVIL - TRANSFERENCIA
// 🔹 JEP Móvil - Transferencias
else if (/Transferencia Enviada|COMPROBANTE DE TRANSFERENCIA/i.test(text) && /No\.?\s*JM\d{4}[A-Z]{3}\d{6,}/i.test(text)) {
    banco = "JEP MÓVIL - TRANSFERENCIA";

    console.log("✅ Detectado comprobante de transferencia en JEP Móvil");

    const comprobanteRegex = /No\.?\s*JM(\d{4}[A-Z]{3}\d{6,})/i; // Extraer el número de JM
    const montoRegex = /Monto:\s*\$?([\d,\.]+)/i;
    const fechaRegex = /Fecha:\s*(\d{2}\/\d{2}\/\d{4})\s*(\d{2}:\d{2}:\d{2})?/i;

    // Extraer número de comprobante
    let matchNumero = text.match(comprobanteRegex);
    if (matchNumero) {
        numero = `JM${matchNumero[1].trim()}`;
        console.log("📌 Número de transacción extraído:", numero);
    } else {
        console.log("🚨 No se encontró el número de transacción");
    }

    // Extraer monto
    let matchMonto = text.match(montoRegex);
    if (matchMonto) {
        monto = matchMonto[1].trim().replace(",", ".");
        console.log("📌 Monto extraído:", monto);
    } else {
        console.log("🚨 No se encontró el monto");
    }

    // Extraer fecha
    let matchFecha = text.match(fechaRegex);
    if (matchFecha) {
        fecha = moment(`${matchFecha[1]} ${matchFecha[2] || "00:00:00"}`, "DD/MM/YYYY HH:mm:ss")
            .format("DD MMM. YYYY HH:mm");
        console.log("📌 Fecha extraída:", fecha);
    } else {
        fecha = moment().tz("America/Guayaquil").format("DD MMM. YYYY HH:mm");
        console.log("🚨 No se encontró la fecha, usando fecha actual:", fecha);
    }
}




//DEPOSITOS JEP
    else if (/JUVENTUD ECUATORIANA PROGRESISTA/i.test(text) || /JEP/i.test(text)) {
        banco = "COOPERATIVA JEP";
    
        const comprobanteRegex = /FERENCIA\s*\+\s*(\d+)/i; // Número de referencia
        const montoRegex = /R DEPOSITADO\s*[:;]\s*USD\s*([\d,\.]+)/i; // Mejorado para aceptar `:` o `;`
        const fechaRegex = /ECHA\s*:\s*(\d{2}-\d{2}-\d{4})/i;
    
        // Extraer datos
        numero = text.match(comprobanteRegex) ? text.match(comprobanteRegex)[1].trim() : "-";
        monto = text.match(montoRegex) ? text.match(montoRegex)[1].replace(",", ".") : "-";
    
        // Extraer y formatear fecha correctamente
        fecha = text.match(fechaRegex) 
            ? moment(text.match(fechaRegex)[1], "DD-MM-YYYY").format("DD MMM. YYYY") 
            : moment().tz("America/Guayaquil").format("DD MMM. YYYY HH:mm");
    }
    else if (text.includes("d1")) {
        banco = "D1";
        const comprobanteRegex = /Nro\. de transacción\s*(\d+)/i;
        const nombresRegex = /Pagaste a\s*([A-Za-z\s]+)/i;
        const montoRegex = /\$(\d+[\.,]\d{2})/i;
        const fechaRegex = /Fecha de pago\s*(\d{2} [a-z]{3} \d{4} - \d{2}:\d{2} [ap]m)/i;
    
        numero = text.match(comprobanteRegex) ? text.match(comprobanteRegex)[1].trim() : "-";
        nombres = text.match(nombresRegex) ? text.match(nombresRegex)[1].trim() : "-";
        monto = text.match(montoRegex) ? text.match(montoRegex)[1] : "-";
        fecha = text.match(fechaRegex) 
            ? moment(text.match(fechaRegex)[1], "DD MMM YYYY - hh:mm a").format("DD MMM. YYYY HH:mm") 
            : moment().tz("America/Guayaquil").format("DD MMM. YYYY HH:mm");
    }
    else if (/Banco Guayaquil/i.test(text) || /No\.\d+/i.test(text)) {
        banco = "BANCO GUAYAQUIL";
        console.log("✅ Detectado Banco Guayaquil");
    
        const comprobanteRegex = /No\.\s*(\d+)/i;
        const montoDebitadoRegex = /Valor debitado\s*\$\s*(\d+\.\d{2})/i;
        const comisionRegex = /Comisión\s*\$\s*(\d+\.\d{2})/i;
        const fechaRegex = /(\d{2}\/\d{2}\/\d{4})\s*(\d{2}:\d{2}:\d{2})/;
    
        let matchNumero = text.match(comprobanteRegex);
        if (matchNumero) {
            numero = matchNumero[1].trim();
            console.log("📌 Número de comprobante extraído:", numero);
        } else {
            console.log("🚨 No se encontró el número de comprobante");
        }
    
        let matchMontoDebitado = text.match(montoDebitadoRegex);
        let matchComision = text.match(comisionRegex);
    
        let montoDebitado = matchMontoDebitado ? parseFloat(matchMontoDebitado[1]) : 0;
        let comision = matchComision ? parseFloat(matchComision[1]) : 0;
    
        monto = (montoDebitado - comision).toFixed(2);
        console.log(`📌 Monto calculado: ${monto} (Valor Debit: ${montoDebitado} - Comisión: ${comision})`);
    
        let matchFecha = text.match(fechaRegex);
        if (matchFecha) {
            fecha = moment(matchFecha[1], "DD/MM/YYYY").format("DD MMM. YYYY");
            console.log("📌 Fecha extraída:", fecha);
        } else {
            fecha = moment().tz("America/Guayaquil").format("DD MMM. YYYY HH:mm");
            console.log("🚨 No se encontró la fecha, usando fecha actual:", fecha);
        }
    }
    

    //DEPOSITO BANCO DEL PACIFICO
    // 🔹 Banco del Pacífico (Depósito)
else if (
    (/Banco Del Pac[ií]fic/i.test(text) && /Comprobante De Transacci[oó]n/i.test(text)) ||  // Primera condición
    /Secuencial Tbba|Tbba/i.test(text)  // Segunda condición (detecta sin necesidad de "Banco del Pacífico")
) {
    console.log("✅ Detectado DEPÓSITO - BANCO DEL PACÍFICO");
    banco = "DEPÓSITO - BANCO DEL PACÍFICO";

    // 🛠 Expresiones regulares mejoradas
    const numeroRegex = /(?:Transacci[oó]n|Transaccl[oó]n|Transaccl[oó]…|Transac[cç]?[ií]?[oó]?n?)\s*[:;]?\s*(\d+)/i;
    const secuencialRegex = /Secuencial Tbba\s*[:;]?\s*(\d+)/i;
    const montoRegex = /Valor\s*[:;]?\s*\$?\s*([\d,\.]+)/i;
    const fechaRegex = /Fecha\s*[:;]?\s*(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})?/i;

    // 📌 Extraer número de transacción o secuencial si no encuentra transacción
    let matchNumero = text.match(numeroRegex);
    let matchSecuencial = text.match(secuencialRegex);
    numero = matchNumero ? matchNumero[1].trim() : (matchSecuencial ? matchSecuencial[1].trim() : "-");

    // 📌 Extraer monto correctamente
    let matchMonto = text.match(montoRegex);
    monto = matchMonto ? matchMonto[1].replace(",", ".") : "-";

    // 📌 Extraer fecha correctamente
    let matchFecha = text.match(fechaRegex);
    if (matchFecha) {
        fecha = moment(`${matchFecha[1]} ${matchFecha[2] || "00:00:00"}`, "DD/MM/YYYY HH:mm:ss").format("DD MMM. YYYY HH:mm");
    } else {
        fecha = moment().tz("America/Guayaquil").format("DD MMM. YYYY HH:mm");
    }

    console.log("📥 Datos extraídos:", { numero, nombres, monto, fecha, banco });
}

    
    







else if (/NO\.\s*COMPROBANTE/i.test(text) || /BANCO DEL AUSTRO/i.test(text)) {
    banco = "BANCO DEL AUSTRO";
    console.log("✅ Detectado Banco del Austro");

    const comprobanteRegex = /NO\.\s*COMPROBANTE[^0-9]*(\d+)/i;
    const montoRegex = /VALOR TRANSFERIDO:\s*\$\s*(\d+[\.,]\d{2})/i;
    const fechaRegex = /FECHA:\s*(\d{2}-\d{2}-\d{4})/i;

    let matchNumero = text.match(comprobanteRegex);
    if (matchNumero) {
        numero = matchNumero[1].trim();
        console.log("📌 Número de comprobante extraído:", numero);
    } else {
        console.log("🚨 No se encontró el número de comprobante");
    }

    let matchMonto = text.match(montoRegex);
    monto = matchMonto ? matchMonto[1].trim() : "-";
    console.log("📌 Monto extraído:", monto);

    let matchFecha = text.match(fechaRegex);
    if (matchFecha) {
        fecha = moment(matchFecha[1], "DD-MM-YYYY").format("DD MMM. YYYY");
        console.log("📌 Fecha extraída:", fecha);
    } else {
        fecha = moment().tz("America/Guayaquil").format("DD MMM. YYYY HH:mm");
        console.log("🚨 No se encontró la fecha, usando fecha actual:", fecha);
    }
}

    else {
        banco = "DESCONOCIDO";
        const comprobanteRegex = /(?:Comprobante(?:\s*Nro\.?)?|Número de transacción|Código de transacción|Referencia|N°|No\.?)\s*[:#-]*\s*([A-Z0-9.-]{6,})/i;
        const nombresRegex = /(?:Para:|Beneficiario:|Perteneciente a:|Nombre:|Titular Cuenta:)\s*([A-Za-z\s]+)/i;
        const montoRegex = /\$?\s?(\d+[\.,]\d{2})/i;

        numero = text.match(comprobanteRegex) ? text.match(comprobanteRegex)[1].trim() : "-";
        nombres = text.match(nombresRegex) ? text.match(nombresRegex)[1].trim() : "-";
        monto = text.match(montoRegex) ? text.match(montoRegex)[1] : "-";
        fecha = moment().tz("America/Guayaquil").format("DD MMM. YYYY HH:mm");
    }

    console.log("📥 Datos extraídos:", { numero, nombres, monto, fecha, banco });

     // **Si se detectó un número de comprobante, se retorna como válido**
     if (numero !== "-") {
        return { numero, nombres, monto, fecha, banco };
    }

    // **Si no se detecta un número de comprobante, retorna mensaje de soporte**
    console.log("🚫 No se detectó un comprobante de pago.");
    return {
        message: "Si tiene algún problema con su servicio escriba al número de Soporte por favor.",
        resumen: "👉 *Soporte:* 0980757208 👈"
    };
}




// Obtener todos los comprobantes
app.get('/comprobantes', (req, res) => {
    db.query('SELECT * FROM Comprobante', (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// Obtener un comprobante por ID
app.get('/comprobantes/:id', (req, res) => {
    const { id } = req.params;
    db.query('SELECT * FROM Comprobante WHERE id = ?', [id], (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (results.length === 0) {
            return res.status(404).json({ message: 'Comprobante no encontrado' });
        }
        res.json(results[0]);
    });
});

// Crear un comprobante con OCR
app.post('/comprobantes', (req, res) => {
    let { text, whatsapp } = req.body;

    if (!text || !whatsapp) {
        return res.status(200).json({ 
            message: "❌ No se recibió información válida", 
            resumen: "📌 Intente de nuevo con una imagen clara del comprobante."
        });
    }

     
    const datosExtraidos = extraerDatosOCR(text);

    // Si la imagen no es un comprobante, retorna el mensaje y evita la inserción
    if (datosExtraidos.mensaje) {
        return res.status(200).json({ 
            message: "Si tiene algún problema con su servicio escriba al número de Soporte por favor.", 
            resumen: "👉 *Soporte:* 0980757208 👈"
        });
    }

    let { numero, nombres, monto, fecha, banco } = datosExtraidos;

    // **CORRECCIÓN**: Solo verificar `numero`, no `monto`
    if (!numero || numero === "-") {
        console.log("🚫 No se detectó un comprobante de pago.");
        return res.status(200).json({
            message: "Si tiene algún problema con su servicio escriba al número de Soporte por favor.",
            resumen: "👉 *Soporte:* 0980757208 👈"
        });
    }

    console.log("📥 Datos extraídos:", { numero, nombres, monto, fecha, whatsapp, banco });

    // Verificar si el comprobante ya existe en MySQL
    db.query('SELECT * FROM Comprobante WHERE numero = ?', [numero], (err, results) => {
        if (err) {
            console.error("❌ Error en SELECT:", err);
            return res.status(200).json({ 
                message: "❌ Error interno del servidor", 
                resumen: "📌 Intente nuevamente más tarde." 
            });
        }

        if (results.length > 0) {
            console.log("🚫 Comprobante ya registrado:", numero);
        
            // Obtener los últimos 5 dígitos del número de WhatsApp y formatearlo como "09XXX*****"
            const numeroOculto = `09XXX${results[0].whatsapp.slice(-5)}`;
        
            const resumen = `📌 **Número:** ${results[0].numero}\n📞 **Enviado desde:** ${numeroOculto}\n📅 **Fecha de envío:** ${results[0].fecha}\n💰 **Monto:** $${monto}`;
        
            return res.status(200).json({
                message: `🚫 Este comprobante ya ha sido presentado por el número ${numeroOculto}.`,
                resumen: resumen
            });
        }
        
        // Insertar en MySQL con los datos extraídos
        db.query('INSERT INTO Comprobante (numero, nombres, descripcion, fecha, whatsapp, monto) VALUES (?, ?, ?, ?, ?, ?)',
            [numero, nombres || "Desconocido", "Pago recibido", fecha, whatsapp, monto], (err) => {
                if (err) {
                    console.error("❌ Error en la inserción:", err);
                    return res.status(200).json({ 
                        message: "❌ Error al guardar el comprobante", 
                        resumen: "📌 Intente nuevamente o contacte a soporte." 
                    });
                }
                console.log("✅ Comprobante guardado en la base de datos");

                const resumen = `📌 **Número:** ${numero}\n📞 **Enviado desde:** ${whatsapp}\n📅 **Fecha de envío:** ${fecha}\n💰 **Monto:** $${monto}`;

                res.status(200).json({ message: `✅ Comprobante registrado exitosamente desde el número ${whatsapp}.`, resumen });
            });
    });
});




// Iniciar el servidor en Railway
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});




