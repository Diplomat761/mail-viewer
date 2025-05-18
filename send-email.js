require('dotenv').config();
const nodemailer = require('nodemailer');

// Функция для отправки письма
async function sendEmail(to, subject, text, attachments = [], account) {
  try {
    // Настройка транспорта
    const transporter = nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.smtpPort === 465, // true для 465, false для других портов
      auth: {
        user: account.email,
        pass: account.password
      },
      tls: {
        rejectUnauthorized: false // Отключение проверки сертификата (небезопасно в продакшне)
      }
    });

    // Создание опций письма
    const mailOptions = {
      from: account.email,
      to: to,
      subject: subject,
      text: text,
      attachments: attachments.map(filePath => ({ path: filePath }))
    };

    // Отправка письма
    const info = await transporter.sendMail(mailOptions);
    
    console.log('Письмо успешно отправлено');
    console.log('ID письма:', info.messageId);
    
    return info;
  } catch (error) {
    console.error('Ошибка при отправке письма:', error);
    throw error;
  }
}

// Пример использования
if (require.main === module) {
  // Если файл запущен напрямую (не импортирован)
  const recipient = process.argv[2] || 'recipient@example.com';
  const subject = process.argv[3] || 'Тестовое письмо';
  const message = process.argv[4] || 'Это тестовое сообщение отправлено с помощью Node.js';
  const attachmentFiles = process.argv.slice(5); // Все оставшиеся аргументы считаются путями к файлам для вложений
  
  sendEmail(recipient, subject, message, attachmentFiles)
    .then(() => console.log('Письмо отправлено успешно'))
    .catch(err => console.error('Не удалось отправить письмо:', err));
}

module.exports = { sendEmail }; 