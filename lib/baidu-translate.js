const axios = require('axios');
const md5 = require('./md5');

const appid = '';
const key = '';

/**
 * Baidu translation service
 * 
 * @param {string} text a text
 * @returns {string}
 */
module.exports = async function baiduTranslate(text, config) {
  const salt = new Date().getTime();
  const sign = md5(appid + text + salt + key);
  const { to } = config;
  const response = await axios.get(
    `http://api.fanyi.baidu.com/api/trans/vip/translate?q=${encodeURI(text)}&from=zh&to=${to}&appid=${appid}&salt=${salt}&sign=${sign}`,
  );
  if (response.data.trans_result && response.data.trans_result.length > 0) {
    return {
      data: [response.data.trans_result[0].dst || ''],
    };
  }
}
