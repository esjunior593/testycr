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
    
    // Buscar el número de comprobante y reasignar sin redeclarar
    const comprobanteRegex = /Número de comprobante:\s*(\d+)/i;
    let matchNumero = text.match(comprobanteRegex);
    if (matchNumero) {
        numero = matchNumero[1].trim();
    }

    // 🔹 Detectar Banco del Pacífico
    if (/BANCO DEL PAC[IÍ]FICO/i.test(text) || /BdP/i.test(text)) {
        banco = "BANCO DEL PACÍFICO";
    
        const montoRegex = /ha enviado \$(\d+\.\d{2})/i;
        const fechaRegex = /(\d{2})\s*(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\.\s*(\d{4})\s*-\s*(\d{2}:\d{2})/i;
    
        monto = text.match(montoRegex) ? text.match(montoRegex)[1] : "-";

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

    // 🔹 Si se detecta un número de comprobante, **se considera válido**
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
