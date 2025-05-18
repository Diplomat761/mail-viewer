require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { sendEmail } = require('./send-email');
const accountsModel = require('./models/accounts');

const app = express();
const port = 4000;

// Настройка для загрузки файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

// Настройка шаблонизатора и статических файлов
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use('/attachments', express.static(path.join(__dirname, 'attachments')));
app.use(bodyParser.urlencoded({ extended: true }));

// Передача объекта req в шаблоны
app.use((req, res, next) => {
  res.locals.req = req;
  next();
});

// Главная страница
app.get('/', (req, res) => {
  const accounts = accountsModel.getAccounts();
  const activeAccount = accountsModel.getActiveAccount();
  let success = null;
  
  if (req.query.success === 'true') {
    success = 'Письмо успешно отправлено!';
  } else if (req.query.success) {
    success = req.query.success;
  }
  
  res.render('index', { accounts, activeAccount, success });
});

// Управление аккаунтами
app.get('/accounts', (req, res) => {
  const accounts = accountsModel.getAccounts();
  let error = null;
  let success = null;
  
  if (req.query.error) {
    error = req.query.error;
  }
  
  if (req.query.success) {
    success = req.query.success;
  }
  
  res.render('accounts', { accounts, error, success });
});

// Добавление нового аккаунта
app.post('/accounts/add', (req, res) => {
  const { email, password, name, imapHost, imapPort, smtpHost, smtpPort } = req.body;
  
  if (!email || !password || !imapHost || !smtpHost) {
    return res.redirect('/accounts?error=Все обязательные поля должны быть заполнены');
  }
  
  try {
    const account = {
      email,
      password,
      name: name || '',
      imapHost,
      imapPort: parseInt(imapPort, 10) || 993,
      smtpHost,
      smtpPort: parseInt(smtpPort, 10) || 587
    };
    
    accountsModel.addAccount(account);
    res.redirect('/accounts?success=Аккаунт успешно добавлен');
  } catch (error) {
    console.error('Ошибка при добавлении аккаунта:', error);
    res.redirect(`/accounts?error=${encodeURIComponent('Ошибка при добавлении аккаунта: ' + error.message)}`);
  }
});

// Активация аккаунта
app.post('/accounts/activate', (req, res) => {
  const { accountId } = req.body;
  
  if (!accountId) {
    return res.redirect('/accounts?error=ID аккаунта не указан');
  }
  
  try {
    accountsModel.setActiveAccount(accountId);
    res.redirect('/?success=Аккаунт успешно активирован');
  } catch (error) {
    console.error('Ошибка при активации аккаунта:', error);
    res.redirect(`/accounts?error=${encodeURIComponent('Ошибка при активации аккаунта: ' + error.message)}`);
  }
});

// Удаление аккаунта
app.post('/accounts/delete', (req, res) => {
  const { accountId } = req.body;
  
  if (!accountId) {
    return res.redirect('/accounts?error=ID аккаунта не указан');
  }
  
  try {
    const result = accountsModel.deleteAccount(accountId);
    
    if (result) {
      res.redirect('/accounts?success=Аккаунт успешно удален');
    } else {
      res.redirect(`/accounts?error=${encodeURIComponent('Не удалось удалить аккаунт')}`);
    }
  } catch (error) {
    console.error('Ошибка при удалении аккаунта:', error);
    res.redirect(`/accounts?error=${encodeURIComponent('Ошибка при удалении аккаунта: ' + error.message)}`);
  }
});

// Получение списка писем
app.get('/emails', (req, res) => {
  const activeAccount = accountsModel.getActiveAccount();
  
  if (!activeAccount) {
    return res.redirect('/?error=Нет активного аккаунта');
  }
  
  console.log('Начинаем получение писем...');
  fetchEmails(activeAccount, (error, emails) => {
    if (error) {
      console.error('Ошибка при получении писем:', error);
      return res.status(500).render('error', { error: error.message });
    }
    console.log(`Получено писем: ${emails.length}`);
    // Сортируем письма по дате (новые в начале)
    emails.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.render('emails', { emails });
  });
});

// Форма отправки письма
app.get('/compose', (req, res) => {
  const activeAccount = accountsModel.getActiveAccount();
  
  if (!activeAccount) {
    return res.redirect('/?error=Нет активного аккаунта');
  }
  
  res.render('compose', { activeAccount });
});

// Обработка отправки письма
app.post('/send', upload.array('attachments'), async (req, res) => {
  const activeAccount = accountsModel.getActiveAccount();
  
  if (!activeAccount) {
    return res.redirect('/?error=Нет активного аккаунта');
  }
  
  try {
    const { to, subject, message } = req.body;
    const attachments = req.files ? req.files.map(file => file.path) : [];
    
    await sendEmail(to, subject, message, attachments, activeAccount);
    
    res.redirect('/?success=true');
  } catch (error) {
    console.error('Ошибка при отправке:', error);
    res.status(500).render('error', { error: error.message });
  }
});

// Функция для получения писем
function fetchEmails(account, callback) {
  const imapConfig = {
    user: account.email,
    password: account.password,
    host: account.imapHost,
    port: account.imapPort,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
    debug: false // Отключаем подробный дебаг, но оставляем логи
  };

  console.log(`Подключение к ${imapConfig.host}:${imapConfig.port} для пользователя ${imapConfig.user}`);

  try {
    const imap = new Imap(imapConfig);
    
    imap.once('ready', () => {
      console.log('Соединение установлено успешно');
      
      // Получаем список папок
      imap.getBoxes((err, boxes) => {
        if (err) console.error('Ошибка при получении списка папок:', err);
        else console.log('Доступные папки:', Object.keys(boxes));
        
        // Используем INBOX как основную папку для проверки
        imap.openBox('INBOX', false, (err, box) => {
          if (err) {
            console.error('Ошибка при открытии ящика:', err);
            return callback(err);
          }
          
          console.log('Ящик открыт успешно:', box.name);
          console.log(`Всего сообщений: ${box.messages.total}`);
          
          // Поиск писем без ограничения по дате
          imap.search(['ALL'], (err, results) => {
            if (err) {
              console.error('Ошибка при поиске писем:', err);
              imap.end();
              return callback(err);
            }
            
            // Ограничиваем количество писем для обработки (последние 20)
            if (results.length > 20) {
              results = results.slice(-20);
            }
            
            console.log(`Найдено писем: ${results.length}`);
            
            if (!results.length) {
              imap.end();
              return callback(null, []);
            }

            // Массив для промисов при обработке писем
            const emailPromises = [];
            const emails = [];
            
            // Создаем поток для получения писем
            const f = imap.fetch(results, { bodies: '' });
            
            f.on('message', (msg, seqno) => {
              console.log(`Начало обработки письма #${seqno}`);
              
              // Создаем промис для каждого сообщения
              const messagePromise = new Promise((resolve, reject) => {
                msg.on('body', (stream, info) => {
                  let buffer = '';
                  
                  stream.on('data', (chunk) => {
                    buffer += chunk.toString('utf8');
                  });
                  
                  stream.once('end', () => {
                    // Парсим письмо
                    simpleParser(buffer)
                      .then(mail => {
                        console.log(`Успешно обработано письмо #${seqno}`);
                        
                        // Сохраняем вложения
                        const attachmentInfo = [];
                        if (mail.attachments && mail.attachments.length > 0) {
                          console.log(`Письмо #${seqno} имеет ${mail.attachments.length} вложений`);
                          
                          // Создаем папку для вложений, если она не существует
                          const accountFolder = account.email.replace(/[@.]/g, '_');
                          const attachmentDir = path.join(__dirname, 'attachments', accountFolder);
                          
                          if (!fs.existsSync(attachmentDir)) {
                            fs.mkdirSync(attachmentDir, { recursive: true });
                          }
                          
                          mail.attachments.forEach((attachment, index) => {
                            const filename = `${seqno}_${index}_${attachment.filename}`;
                            const filePath = path.join(attachmentDir, filename);
                            fs.writeFileSync(filePath, attachment.content);
                            attachmentInfo.push({
                              filename: attachment.filename,
                              path: `/attachments/${accountFolder}/${filename}`
                            });
                          });
                        }
                        
                        // Сохраняем информацию о письме
                        const email = {
                          id: seqno,
                          from: mail.from?.text || 'Неизвестный отправитель',
                          to: mail.to?.text || 'Неизвестный получатель',
                          subject: mail.subject || 'Без темы',
                          date: mail.date,
                          text: mail.text || mail.html || 'Нет текста письма',
                          attachments: attachmentInfo
                        };
                        
                        emails.push(email);
                        resolve();
                      })
                      .catch(error => {
                        console.error(`Ошибка при парсинге письма #${seqno}:`, error);
                        resolve(); // Разрешаем промис даже при ошибке, чтобы не блокировать другие письма
                      });
                  });
                });
                
                msg.once('error', err => {
                  console.error(`Ошибка при получении письма #${seqno}:`, err);
                  resolve(); // Разрешаем промис даже при ошибке
                });
              });
              
              emailPromises.push(messagePromise);
            });
            
            f.once('error', (err) => {
              console.error('Ошибка при получении писем:', err);
              imap.end();
              return callback(err);
            });
            
            f.once('end', () => {
              console.log('Получение писем завершено.');
              
              // Ждем обработки всех писем
              Promise.all(emailPromises)
                .then(() => {
                  imap.end();
                  callback(null, emails);
                })
                .catch(error => {
                  console.error('Ошибка при обработке писем:', error);
                  imap.end();
                  callback(error);
                });
            });
          });
        });
      });
    });
    
    imap.once('error', (err) => {
      console.error('Ошибка соединения:', err);
      callback(err);
    });
    
    imap.once('end', () => {
      console.log('Соединение закрыто.');
    });
    
    imap.connect();
  } catch (error) {
    console.error('Ошибка при создании IMAP соединения:', error);
    callback(error);
  }
}

// Страница ошибки
app.get('/error', (req, res) => {
  res.render('error', { error: req.query.message || 'Произошла неизвестная ошибка' });
});

// Обработка ошибок 404
app.use((req, res) => {
  res.status(404).render('error', { error: 'Страница не найдена' });
});

// Запуск сервера
app.listen(port, () => {
  console.log(`Сервер запущен на порту ${port}`);
}); 