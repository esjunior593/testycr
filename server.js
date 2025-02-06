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

    // Palabras clave que deben aparecer en un comprobante de pago
    const palabrasClave = [
        "ha enviado $", 
        "Número de comprobante", 
        "Banco", 
        "Transferencia", 
        "Depósito", 
        "Monto", 
        "Valor debitado", 
        "Referencia"
    ];

    // Verificar si el texto extraído tiene alguna de las palabras clave
    let esComprobante = palabrasClave.some(palabra => text.includes(palabra));

    // Si no encuentra ninguna palabra clave, asumimos que no es un comprobante
    if (!esComprobante) {
        console.log("🚫 La imagen no parece un comprobante de pago.");
        return { mensaje: "❌ La imagen no parece ser un comprobante de pago. Asegúrate de enviar una imagen válida." };
    }

    // Detectar el banco y extraer datos
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
    else if (/BANCO DEL PAC[IÍ]FICO/i.test(text) || /BdP/i.test(text)) {
        banco = "BANCO DEL PACÍFICO";
    
        const comprobanteRegex = /Número de comprobante:\s*(\d+)/i;
        const nombresRegex = /([A-Za-z\s]+) ha enviado \$/i;
        const montoRegex = /ha enviado \$(\d+\.\d{2})/i;
        const fechaRegex = /(\d{2})\s*(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\.\s*(\d{4})\s*-\s*(\d{2}:\d{2})/i;
    
        // Extraer datos
        numero = text.match(comprobanteRegex) ? text.match(comprobanteRegex)[1].trim() : "-";
        nombres = text.match(nombresRegex) ? text.match(nombresRegex)[1].trim() : "-";
        monto = text.match(montoRegex) ? text.match(montoRegex)[1] : "-";
    
        // Formatear fecha correctamente
        if (text.match(fechaRegex)) {
            const fechaMatch = text.match(fechaRegex);
            const meses = { "ene": "Enero", "feb": "Febrero", "mar": "Marzo", "abr": "Abril", "may": "Mayo", "jun": "Junio", "jul": "Julio", "ago": "Agosto", "sep": "Septiembre", "oct": "Octubre", "nov": "Noviembre", "dic": "Diciembre" };
            fecha = `${fechaMatch[1]} ${meses[fechaMatch[2]]} ${fechaMatch[3]} ${fechaMatch[4]}`;
        } else {
            fecha = moment().tz("America/Guayaquil").format("DD MMM. YYYY HH:mm");
        }
    }
    
    else if (text.includes("RUC CNB") || (text.includes("DEPÓSITO") && text.includes("CUENTA DE AHORROS"))) {
        console.log("📌 Detectado DEPÓSITO - BANCO PICHINCHA");
        banco = "DEPÓSITO - BANCO PICHINCHA";
    
        // 🛠 Expresiones Regulares Mejoradas
        const comprobanteRegex = /Documento\.*:\s*(\d+)/i; 
        const nombresRegex = /Nombre CNB\.*:\s*([A-Za-z\s]+)/i;
        const montoRegex = /Efectivo\.*:\s*\$?\s*(\d+[\.,]?\d{0,2})/i;
        const fechaRegex = /Fecha\.*:\s*(\d{4})\/([a-zA-Z]+)\/(\d{2})\s*-\s*(\d{2}:\d{2})/i;
    
        // 📌 Extraer número de comprobante correctamente desde "Documento.: 270297"
        const numeroMatch = text.match(comprobanteRegex);
        numero = numeroMatch ? numeroMatch[1] : "-";
    
        // 📌 Extraer nombre correcto sin "RUC CNB"
        const nombresMatch = text.match(nombresRegex);
        nombres = nombresMatch ? nombresMatch[1].trim() : "-";
    
        // 📌 Extraer monto correctamente
        const montoMatch = text.match(montoRegex);
        monto = montoMatch ? montoMatch[1] : "-";
    
        // 📌 Extraer fecha correctamente y formatearla
        if (text.match(fechaRegex)) {
            const fechaMatch = text.match(fechaRegex);
            const mesEnEspanol = {
                "ene": "Enero", "feb": "Febrero", "mar": "Marzo", "abr": "Abril",
                "may": "Mayo", "jun": "Junio", "jul": "Julio", "ago": "Agosto",
                "sep": "Septiembre", "oct": "Octubre", "nov": "Noviembre", "dic": "Diciembre"
            };
            const mes = fechaMatch[2].toLowerCase();
            fecha = `${fechaMatch[3]} ${mesEnEspanol[mes] || mes} ${fechaMatch[1]} ${fechaMatch[4]}`;
        } else {
            fecha = moment().tz("America/Guayaquil").format("DD MMM. YYYY HH:mm");
        }
    
        console.log("📥 Datos extraídos:", { numero, nombres, monto, fecha, banco });
    }
    else if (/NO\.\s*COMPROBANTE/i.test(text) || text.includes("AUSTRO")) {
        banco = "BANCO DEL AUSTRO";
        const comprobanteRegex = /NO\.\s*COMPROBANTE[^0-9]*(\d+)/i;
        const nombresRegex = /BENEFICIARIO:\s*([A-Z\s]+)/i;
        const montoRegex = /VALOR TRANSFERIDO:\s*\$\s*(\d+[\.,]\d{2})/i;
        const fechaRegex = /FECHA:\s*(\d{2}-\d{2}-\d{4})/i;
    
        numero = text.match(comprobanteRegex) ? text.match(comprobanteRegex)[1].trim() : "-";
        nombres = text.match(nombresRegex) ? text.match(nombresRegex)[1].trim() : "-";
        monto = text.match(montoRegex) ? text.match(montoRegex)[1] : "-";
        fecha = text.match(fechaRegex) 
            ? moment(text.match(fechaRegex)[1], "DD-MM-YYYY").format("DD MMM. YYYY") 
            : moment().tz("America/Guayaquil").format("DD MMM. YYYY HH:mm");
    }
    // Banco Guayaquil
    else if (/Banco Guayaquil/i.test(text) || /No\.\d+/i.test(text)) {
        banco = "BANCO GUAYAQUIL";
    
        const comprobanteRegex = /No\.\s*(\d+)/i;
        const montoDebitadoRegex = /Valor debitado\s*\$\s*(\d+\.\d{2})/i;
        const comisionRegex = /Comisión\s*\$\s*(\d+\.\d{2})/i;
        const fechaRegex = /(\d{2}\/\d{2}\/\d{4})\s*(\d{2}:\d{2}:\d{2})/;
        const nombresRegex = /(?:Vera Litardo Blanca Herminia|Amelia Ruiz)/i;
    
        numero = text.match(comprobanteRegex) ? text.match(comprobanteRegex)[1].trim() : "-";
        montoDebitado = text.match(montoDebitadoRegex) ? parseFloat(text.match(montoDebitadoRegex)[1]) : 0;
        comision = text.match(comisionRegex) ? parseFloat(text.match(comisionRegex)[1]) : 0;
        monto = (montoDebitado - comision).toFixed(2);
        nombres = text.match(nombresRegex) ? text.match(nombresRegex)[0].trim() : "-";
    
        fecha = text.match(fechaRegex) 
            ? moment(text.match(fechaRegex)[1], "DD/MM/YYYY").format("DD MMM. YYYY") 
            : moment().tz("America/Guayaquil").format("DD MMM. YYYY HH:mm");
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

    return { numero, nombres, monto, fecha, banco };
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
        return res.status(200).json({ message: "❌ No se recibió información válida", resumen: "📌 Intente de nuevo con una imagen clara del comprobante." });
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

    // Verificar si los datos esenciales están presentes
    if (!numero || numero === "-" || !monto || monto === "-") {
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
