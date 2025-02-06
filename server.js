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

    const contienePalabrasClave = palabrasClave.some(palabra => text.includes(palabra));
    
    if (!contienePalabrasClave) {
        console.log("❌ OCR detectó texto, pero no parece un comprobante.");
        return {
            mensaje: "❌ La imagen no parece ser un comprobante de pago.",
            resumen: "📌 Asegúrate de enviar una foto clara del comprobante sin cortes ni reflejos."
        };
    }

    // 🔹 Banco del Pacífico
    if (/BANCO DEL PAC[IÍ]FICO/i.test(text) || /BdP/i.test(text)) {
        banco = "BANCO DEL PACÍFICO";
        const numeroRegex = /Transacci[oó]n\s*(\d+)/i;
        const montoRegex = /Valor:\s*\$?\s*(\d+[\.,]?\d{0,2})/i;

        let matchNumero = text.match(numeroRegex);
        let matchMonto = text.match(montoRegex);

        numero = matchNumero ? matchNumero[1].trim() : "-";
        monto = matchMonto ? matchMonto[1].trim().replace(",", ".") : "-";

        console.log("📌 Banco detectado: BANCO DEL PACÍFICO");
        console.log("📌 Número de transacción detectado:", numero);
        console.log("💰 Monto detectado:", monto);
    }
    
    // 🔹 Banco Guayaquil
    else if (/Banco Guayaquil/i.test(text)) {
        banco = "BANCO GUAYAQUIL";
        const numeroRegex = /Transacci[oó]n\s*(\d+)/i;
        const montoRegex = /Valor debitado\s*\$\s*(\d+\.\d{2})/i;
        let matchNumero = text.match(numeroRegex);
        let matchMonto = text.match(montoRegex);
        numero = matchNumero ? matchNumero[1].trim() : "-";
        monto = matchMonto ? matchMonto[1].trim() : "-";
    }
    
    // 🔹 Banco Pichincha
    else if (/Banco Pichincha/i.test(text)) {
        banco = "BANCO PICHINCHA";
        const numeroRegex = /Número de comprobante:\s*(\d+)/i;
        const montoRegex = /Efectivo\.*:\s*\$?\s*(\d+[\.,]?\d{0,2})/i;
        let matchNumero = text.match(numeroRegex);
        let matchMonto = text.match(montoRegex);
        numero = matchNumero ? matchNumero[1].trim() : "-";
        monto = matchMonto ? matchMonto[1].trim() : "-";
    }
    
    // 🔹 Si no se detecta ningún banco conocido, pero hay un número de comprobante, se registra como DESCONOCIDO
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

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});
