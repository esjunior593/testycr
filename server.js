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
    let numero, nombres, monto, fecha, banco;

    console.log("Texto OCR extraído:", text); // Depuración para ver el texto sin procesar

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
    else if (/Banco Guayaquil/i.test(text)) {
        banco = "BANCO GUAYAQUIL";
    
        const comprobanteRegex = /No\.\s*(\d+)/i;
        const nombresRegex = /(?:Vera Litardo Blanca Herminia|Amelia Ruiz)/i;
        const montoRegex = /Valor debitado\s*\$\s*(\d+\.\d{2})/i;
        const comisionRegex = /Comisión\s*\$\s*(\d+\.\d{2})/i;
        const fechaRegex = /(\d{2}\/\d{2}\/\d{4})\s*(\d{2}:\d{2}:\d{2})/;
    
        numero = text.match(comprobanteRegex) ? text.match(comprobanteRegex)[1].trim() : "-";
        nombres = text.match(nombresRegex) ? text.match(nombresRegex)[0].trim() : "-";
        monto = text.match(montoRegex) ? parseFloat(text.match(montoRegex)[1]) : 0;
        comision = text.match(comisionRegex) ? parseFloat(text.match(comisionRegex)[1]) : 0;
        
        // Calculamos el monto real restando la comisión
        montoReal = (monto - comision).toFixed(2);
    
        fecha = text.match(fechaRegex) 
            ? moment(text.match(fechaRegex)[1], "DD/MM/YYYY").format("DD MMM. YYYY") 
            : moment().tz("America/Guayaquil").format("DD MMM. YYYY HH:mm");
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
    
    // Detectar si es de deuna
    else if (/Nro\. de transacción/i.test(text) && /Fecha de pago/i.test(text)) {
        banco = "d1";
        const comprobanteRegex = /Nro\. de transacción\s*(\d+)/i;
        const nombresRegex = /Pagaste a\s*([A-Za-z\s]+)/i;
        const montoRegex = /\$\s*(\d+[\.,]\d{2})/i;
        const fechaRegex = /Fecha de pago\s*(\d{2} \w{3} \d{4} - \d{2}:\d{2} (?:am|pm))/i;

        numero = text.match(comprobanteRegex) ? text.match(comprobanteRegex)[1] : "-";
        nombres = text.match(nombresRegex) ? text.match(nombresRegex)[1].trim() : "-";
        monto = text.match(montoRegex) ? text.match(montoRegex)[1].replace(",", ".") : "-";
        fecha = text.match(fechaRegex) 
            ? moment(text.match(fechaRegex)[1], "DD MMM YYYY - hh:mm a").format("DD MMM. YYYY HH:mm") 
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
        return res.status(200).json({ message: "❌ No se recibió información válida", resumen: null });
    }

    const { numero, nombres, monto, fecha } = extraerDatosOCR(text);

    console.log("📥 Datos extraídos:", { numero, nombres, monto, fecha, whatsapp });

    // Verificar si el comprobante ya existe en MySQL
    db.query('SELECT * FROM Comprobante WHERE numero = ?', [numero], (err, results) => {
        if (err) {
            console.error("❌ Error en SELECT:", err);
            return res.status(200).json({ message: "❌ Error interno del servidor", resumen: null });
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
            [numero, nombres, "Pago recibido", fecha, whatsapp, monto], (err) => {
                if (err) {
                    console.error("❌ Error en la inserción:", err);
                    return res.status(200).json({ message: "❌ Error al guardar el comprobante", resumen: null });
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
