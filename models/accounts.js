const fs = require('fs');
const path = require('path');

// Путь к файлу JSON с аккаунтами
const accountsFilePath = path.join(__dirname, '../data/accounts.json');

// Проверяем, существует ли директория data
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Проверяем, существует ли файл с аккаунтами, если нет - создаем пустой
if (!fs.existsSync(accountsFilePath)) {
  // Создаем файл с пустым массивом аккаунтов
  fs.writeFileSync(accountsFilePath, JSON.stringify([], null, 2));
}

/**
 * Получить все почтовые аккаунты
 * @returns {Array} Массив почтовых аккаунтов
 */
function getAccounts() {
  try {
    const data = fs.readFileSync(accountsFilePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Ошибка при чтении файла аккаунтов:', error);
    return [];
  }
}

/**
 * Добавить новый почтовый аккаунт
 * @param {Object} account Объект с данными аккаунта
 * @returns {Object} Добавленный аккаунт
 */
function addAccount(account) {
  try {
    const accounts = getAccounts();
    
    // Добавляем id к аккаунту
    const newAccount = {
      ...account,
      id: Date.now().toString(),
      active: accounts.length === 0 // Первый аккаунт делаем активным
    };
    
    accounts.push(newAccount);
    
    // Сохраняем обновленный список аккаунтов
    fs.writeFileSync(accountsFilePath, JSON.stringify(accounts, null, 2));
    
    return newAccount;
  } catch (error) {
    console.error('Ошибка при добавлении аккаунта:', error);
    throw error;
  }
}

/**
 * Удалить почтовый аккаунт
 * @param {string} accountId ID аккаунта для удаления
 * @returns {boolean} Результат операции
 */
function deleteAccount(accountId) {
  try {
    let accounts = getAccounts();
    const accountIndex = accounts.findIndex(acc => acc.id === accountId);
    
    if (accountIndex === -1) {
      return false;
    }
    
    // Проверяем, был ли удаляемый аккаунт активным
    const wasActive = accounts[accountIndex].active;
    
    // Удаляем аккаунт из массива
    accounts.splice(accountIndex, 1);
    
    // Если удаленный аккаунт был активным и есть другие аккаунты, делаем первый активным
    if (wasActive && accounts.length > 0) {
      accounts[0].active = true;
    }
    
    // Сохраняем обновленный список аккаунтов
    fs.writeFileSync(accountsFilePath, JSON.stringify(accounts, null, 2));
    
    return true;
  } catch (error) {
    console.error('Ошибка при удалении аккаунта:', error);
    return false;
  }
}

/**
 * Изменение активного почтового аккаунта
 * @param {string} accountId ID аккаунта для активации
 * @returns {boolean} Результат операции
 */
function setActiveAccount(accountId) {
  try {
    const accounts = getAccounts();
    
    // Сначала сбрасываем active у всех аккаунтов
    accounts.forEach(acc => acc.active = false);
    
    // Находим нужный аккаунт и делаем его активным
    const account = accounts.find(acc => acc.id === accountId);
    if (!account) {
      return false;
    }
    
    account.active = true;
    
    // Сохраняем обновленный список аккаунтов
    fs.writeFileSync(accountsFilePath, JSON.stringify(accounts, null, 2));
    
    return true;
  } catch (error) {
    console.error('Ошибка при изменении активного аккаунта:', error);
    return false;
  }
}

/**
 * Получить активный почтовый аккаунт
 * @returns {Object|null} Активный аккаунт или null, если нет аккаунтов
 */
function getActiveAccount() {
  try {
    const accounts = getAccounts();
    
    if (accounts.length === 0) {
      return null;
    }
    
    // Находим активный аккаунт
    const activeAccount = accounts.find(acc => acc.active);
    
    // Если нет активного аккаунта, делаем первый активным
    if (!activeAccount && accounts.length > 0) {
      accounts[0].active = true;
      fs.writeFileSync(accountsFilePath, JSON.stringify(accounts, null, 2));
      return accounts[0];
    }
    
    return activeAccount || null;
  } catch (error) {
    console.error('Ошибка при получении активного аккаунта:', error);
    return null;
  }
}

module.exports = {
  getAccounts,
  addAccount,
  deleteAccount,
  setActiveAccount,
  getActiveAccount
}; 