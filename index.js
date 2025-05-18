require('dotenv').config();
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const fs = require('fs');

// Настройки IMAP
const imapConfig = {
  user: process.env.EMAIL,
  password: process.env.PASSWORD,
  host: process.env.IMAP_HOST,
  port: process.env.IMAP_PORT,
  tls: true,
  tlsOptions: { rejectUnauthorized: false }
};

// Функция для форматирования даты
function formatDate(date) {
  return new Date(date).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Функция для получения писем
function fetchEmails() {
  try {
    const imap = new Imap(imapConfig);
    
    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err, box) => {
        if (err) {
          console.error('Ошибка при открытии ящика:', err);
          return;
        }
        
        // Поиск всех писем за последние 7 дней
        const date = new Date();
        date.setDate(date.getDate() - 7);
        
        imap.search(['ALL', ['SINCE', date]], (err, results) => {
          if (err) {
            console.error('Ошибка при поиске писем:', err);
            imap.end();
            return;
          }
          
          if (!results.length) {
            console.log('Писем не найдено.');
            imap.end();
            return;
          }
          
          console.log(`Найдено писем: ${results.length}`);
          
          // Создаем поток для получения писем
          const f = imap.fetch(results, { bodies: '' });
          
          f.on('message', (msg, seqno) => {
            console.log(`Обработка письма #${seqno}`);
            
            msg.on('body', (stream, info) => {
              let buffer = '';
              
              stream.on('data', (chunk) => {
                buffer += chunk.toString('utf8');
              });
              
              stream.once('end', () => {
                // Парсим письмо
                simpleParser(buffer, (err, mail) => {
                  if (err) {
                    console.error('Ошибка при парсинге письма:', err);
                    return;
                  }
                  
                  console.log('============================================');
                  console.log(`От: ${mail.from.text}`);
                  console.log(`Кому: ${mail.to.text}`);
                  console.log(`Тема: ${mail.subject}`);
                  console.log(`Дата: ${formatDate(mail.date)}`);
                  console.log('---------------------------------------------');
                  console.log(mail.text || mail.html || 'Нет текста письма');
                  console.log('============================================\n');
                  
                  // Сохраняем вложения, если они есть
                  if (mail.attachments && mail.attachments.length > 0) {
                    console.log(`Найдено вложений: ${mail.attachments.length}`);
                    
                    if (!fs.existsSync('./attachments')) {
                      fs.mkdirSync('./attachments');
                    }
                    
                    mail.attachments.forEach((attachment, index) => {
                      const filename = `./attachments/${seqno}_${index}_${attachment.filename}`;
                      fs.writeFileSync(filename, attachment.content);
                      console.log(`Сохранено вложение: ${filename}`);
                    });
                  }
                });
              });
            });
          });
          
          f.once('error', (err) => {
            console.error('Ошибка при получении писем:', err);
          });
          
          f.once('end', () => {
            console.log('Получение писем завершено.');
            imap.end();
          });
        });
      });
    });
    
    imap.once('error', (err) => {
      console.error('Ошибка соединения:', err);
    });
    
    imap.once('end', () => {
      console.log('Соединение закрыто.');
    });
    
    imap.connect();
  } catch (error) {
    console.error('Ошибка в приложении:', error);
  }
}

// Запускаем получение писем
fetchEmails(); 