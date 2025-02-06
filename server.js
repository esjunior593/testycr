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
const db = mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    port: process.env.MYSQL_PORT || 3306
});

db.connect(err => {
    if (err) {
        console.error('Error de conexión a MySQL:', err);
        return;
    }
    console.log('✅ Conectado a MySQL');
});



function extraerDatosOCR(text) {
    let numero = "-", nombres = "-", monto = "-", fecha = "-", banco = "DESCONOCIDO";

    console.log("Texto OCR extraído:", text); // Depuración para ver el texto sin procesar

    

    // Lista de palabras clave que indican que es un comprobante
    const palabrasClave = [
        "Banco", "Transferencia", "No.", "Valor debitado", "Comisión", "Fecha",
        "Monto", "Depósito", "Referencia", "ha enviado $", "Número de comprobante"
    ];

    // Buscar el número de comprobante
    const comprobanteRegex = /Número de comprobante:\s*(\d+)/i;
    let matchNumero = text.match(comprobanteRegex);
    if (matchNumero) {
        numero = matchNumero[1].trim();
    }

    // 🔹 Banco del Pacífico (corrección del monto)
    if (/BANCO DEL PAC[IÍ]FICO/i.test(text) || /BdP/i.test(text)) {
        banco = "BANCO DEL PACÍFICO";
        
        // 🔹 Mejoramos la regex del monto para capturarlo correctamente
        const montoRegex = /ha enviado\s*\$?\s*([\d,\.]+)/i;
        const fechaRegex = /(\d{2})\s*(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\.\s*(\d{4})\s*-\s*(\d{2}:\d{2})/i;
    
        // 🔹 Intentamos extraer el monto
        let matchMonto = text.match(montoRegex);
        monto = matchMonto ? matchMonto[1].trim().replace(",", ".") : "-";
    
        // 🔹 Extraer y formatear fecha correctamente
        if (text.match(fechaRegex)) {
            const fechaMatch = text.match(fechaRegex);
            const meses = {
                "ene": "Enero", "feb": "Febrero", "mar": "Marzo", "abr": "Abril",
                "may": "Mayo", "jun": "Junio", "jul": "Julio", "ago": "Agosto",
                "sep": "Septiembre", "oct": "Octubre", "nov": "Noviembre", "dic": "Diciembre"
            };
            fecha = `${fechaMatch[1]} ${meses[fechaMatch[2]]} ${fechaMatch[3]} ${fechaMatch[4]}`;
        } else {
            fecha = moment().tz("America/Guayaquil").format("DD MMM. YYYY HH:mm");
        }
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
    
    // Depositos JEP
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
          
    // 🔹 DeUna
    else if (/Nro\. de transacción/i.test(text) && /Fecha de pago/i.test(text)) {
        banco = "d1";
        
        const comprobanteRegex = /Nro\. de transacción\s*(\d+)/i;
        const nombresRegex = /Pagaste a\s*([A-Za-z\s]+)/i;
        const montoRegex = /\$\s*(\d+[\.,]\d{2})/i;
        const fechaRegex = /Fecha de pago\s*(\d{2} \w{3} \d{4} - \d{2}:\d{2} (?:am|pm))/i;
    
        // Extraer datos
        numero = text.match(comprobanteRegex) ? text.match(comprobanteRegex)[1] : "-";
        nombres = text.match(nombresRegex) ? text.match(nombresRegex)[1].trim() : "-";
        monto = text.match(montoRegex) ? text.match(montoRegex)[1].replace(",", ".") : "-";
    
        // Extraer y formatear fecha correctamente
        fecha = text.match(fechaRegex) 
            ? moment(text.match(fechaRegex)[1], "DD MMM YYYY - hh:mm a").format("DD MMM. YYYY HH:mm") 
            : moment().tz("America/Guayaquil").format("DD MMM. YYYY HH:mm");
    }
    // 🔹 Banco del Pacífico (Depósito)
// 🔹 Banco del Pacífico (Depósito)
else if (/Banco Del Pac[ií]fico/i.test(text) && /Comprobante De Transacci[oó]n/i.test(text)) {
    banco = "BANCO DEL PACÍFICO";

    const numeroRegex = /Transacción\s*(\d+)/i;
    const nombresRegex = /Nombre:\s*([\w\s]+)/i;
    const montoRegex = /Valor:\s*(\d+[\.,]?\d{0,2})/i;
    const fechaRegex = /Fecha\s*(\d{2}\/\d{2}\/\d{4})\s*(\d{2}:\d{2}:\d{2})?/i;

    // Extraer datos
    numero = text.match(numeroRegex) ? text.match(numeroRegex)[1].trim() : "-";
    nombres = text.match(nombresRegex) ? text.match(nombresRegex)[1].trim() : "-";
    monto = text.match(montoRegex) ? text.match(montoRegex)[1].replace(",", ".") : "-";

    // Extraer y formatear fecha correctamente
    if (text.match(fechaRegex)) {
        const fechaMatch = text.match(fechaRegex);
        fecha = fechaMatch[2] 
            ? `${fechaMatch[1]} ${fechaMatch[2]}`
            : fechaMatch[1];
    } else {
        fecha = moment().tz("America/Guayaquil").format("DD/MM/YYYY HH:mm:ss");
    }
}


    // 🔹 Banco Guayaquil
    else if (/Banco Guayaquil/i.test(text) || /No\.\d+/i.test(text)) {
        banco = "BANCO GUAYAQUIL";

        const montoDebitadoRegex = /Valor debitado\s*\$\s*(\d+\.\d{2})/i;
        const comisionRegex = /Comisión\s*\$\s*(\d+\.\d{2})/i;
        const fechaRegex = /(\d{2}\/\d{2}\/\d{4})\s*(\d{2}:\d{2}:\d{2})/;

        let montoDebitado = text.match(montoDebitadoRegex) ? parseFloat(text.match(montoDebitadoRegex)[1]) : 0;
        let comision = text.match(comisionRegex) ? parseFloat(text.match(comisionRegex)[1]) : 0;
        monto = (montoDebitado - comision).toFixed(2);

        fecha = text.match(fechaRegex) 
            ? moment(text.match(fechaRegex)[1], "DD/MM/YYYY").format("DD MMM. YYYY") 
            : moment().tz("America/Guayaquil").format("DD MMM. YYYY HH:mm");
    }

    // 🔹 Banco del Austro
    else if (/NO\.\s*COMPROBANTE/i.test(text) || text.includes("AUSTRO")) {
        banco = "BANCO DEL AUSTRO";
        const montoRegex = /VALOR TRANSFERIDO:\s*\$\s*(\d+[\.,]\d{2})/i;
        const fechaRegex = /FECHA:\s*(\d{2}-\d{2}-\d{4})/i;

        monto = text.match(montoRegex) ? text.match(montoRegex)[1] : "-";
        fecha = text.match(fechaRegex) 
            ? moment(text.match(fechaRegex)[1], "DD-MM-YYYY").format("DD MMM. YYYY") 
            : moment().tz("America/Guayaquil").format("DD MMM. YYYY HH:mm");
    }

    // 🔹 Banco Pichincha
    else if (text.includes("RUC CNB") || (text.includes("DEPÓSITO") && text.includes("CUENTA DE AHORROS"))) {
        banco = "DEPÓSITO - BANCO PICHINCHA";

        const montoRegex = /Efectivo\.*:\s*\$?\s*(\d+[\.,]?\d{0,2})/i;
        const fechaRegex = /Fecha\.*:\s*(\d{4})\/([a-zA-Z]+)\/(\d{2})\s*-\s*(\d{2}:\d{2})/i;

        monto = text.match(montoRegex) ? text.match(montoRegex)[1] : "-";

        if (text.match(fechaRegex)) {
            const fechaMatch = text.match(fechaRegex);
            const meses = {
                "ene": "Enero", "feb": "Febrero", "mar": "Marzo", "abr": "Abril",
                "may": "Mayo", "jun": "Junio", "jul": "Julio", "ago": "Agosto",
                "sep": "Septiembre", "oct": "Octubre", "nov": "Noviembre", "dic": "Diciembre"
            };
            fecha = `${fechaMatch[3]} ${meses[fechaMatch[2]] || fechaMatch[2]} ${fechaMatch[1]} ${fechaMatch[4]}`;
        } else {
            fecha = moment().tz("America/Guayaquil").format("DD MMM. YYYY HH:mm");
        }
    }

    // 🔹 Banco Internacional
    else if (text.includes("BANCO INTERNACIONAL")) {
        banco = "BANCO INTERNACIONAL";
        const montoRegex = /Monto\s*\$?(\d+[\.,]\d{2})/i;
        const fechaRegex = /Fecha y Hora\s*(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2})/i;

        monto = text.match(montoRegex) ? text.match(montoRegex)[1] : "-";
        fecha = text.match(fechaRegex) 
            ? moment(text.match(fechaRegex)[1], "DD/MM/YYYY HH:mm:ss").format("DD MMM. YYYY HH:mm") 
            : moment().tz("America/Guayaquil").format("DD MMM. YYYY HH:mm");
    }

    // 🔹 Si se detecta un número de comprobante, se considera válido
    if (numero !== "-") {
        return { numero, nombres, monto, fecha, banco };
    }

    // 🔹 Si no se detecta un número de comprobante ni palabras clave, es imagen inválida
    return { 
        mensaje: "❌ La imagen no parece ser un comprobante de pago. Asegúrate de enviar una imagen válida.", 
        resumen: "📌 Intente de nuevo con una imagen clara del comprobante."
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
        console.log("🚫 No se pudo extraer información válida del comprobante.");
        return res.status(200).json({ 
            message: "❌ No se pudo extraer información válida del comprobante.", 
            resumen: "📌 Asegúrese de que el texto sea legible e intente nuevamente."
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

            const resumen = `📌 **Número:** ${results[0].numero}\n📞 **Enviado desde:** ${results[0].whatsapp}\n📅 **Fecha de envío:** ${results[0].fecha}\n💰 **Monto:** $${monto}`;

            return res.status(200).json({
                message: `🚫 Este comprobante ya ha sido presentado por el número ${results[0].whatsapp}.`,
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
