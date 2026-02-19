import DigestFetch from 'digest-fetch';

const HIKVISION_CONFIG = {
  username: process.env.HIKVISION_USERNAME || "admin",
  password: process.env.HIKVISION_PASSWORD || "Tattered3483",
  deviceIp: process.env.HIKVISION_DEVICE_IP || "172.31.0.229",
  batchSize: 50,
  maxBatches: 20,
  authRetryAttempts: 3,
  delayBetweenBatches: 200
};

class AuthManager {
  static createDigestClient() {
    return new DigestFetch(HIKVISION_CONFIG.username, HIKVISION_CONFIG.password, {
      disableRetry: false,
      algorithm: 'MD5'
    });
  }
}

class UserInfoClient {
  constructor(deviceIp) {
    this.deviceIp = deviceIp;
    this.refreshClient();
  }

  refreshClient() {
    this.client = AuthManager.createDigestClient();
  }

  async searchUsersBatch(searchResultPosition = 0, maxResults = HIKVISION_CONFIG.batchSize, retryCount = 0) {
    const body = {
      UserInfoSearchCond: {
        searchID: "1",
        maxResults: maxResults,
        searchResultPosition: searchResultPosition
      }
    };

    const url = `https://${this.deviceIp}/ISAPI/AccessControl/UserInfo/Search?format=json`;

    try {
      const res = await this.client.fetch(url, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" }
      });

      if (res.status === 401 && retryCount < HIKVISION_CONFIG.authRetryAttempts) {
        this.refreshClient();
        await new Promise(resolve => setTimeout(resolve, 500));
        return this.searchUsersBatch(searchResultPosition, maxResults, retryCount + 1);
      }

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Error ${res.status}: ${errorText}`);
      }

      return await res.json();
    } catch (error) {
      console.error(`Error en solicitud: ${error.message}`);

      if (
        retryCount < HIKVISION_CONFIG.authRetryAttempts &&
        (error.message.includes('401') || error.message.includes('network') || error.message.includes('timeout'))
      ) {
        this.refreshClient();
        await new Promise(resolve => setTimeout(resolve, 800));
        return this.searchUsersBatch(searchResultPosition, maxResults, retryCount + 1);
      }

      throw error;
    }
  }
}

class UserQueryService {
  constructor(userInfoClient) {
    this.client = userInfoClient;
  }

  async getAllUsersWithPagination() {
    let allUsers = [];
    let currentPosition = 0;
    let batchCount = 0;
    let consecutiveErrors = 0;

    while (batchCount < HIKVISION_CONFIG.maxBatches && consecutiveErrors < 3) {
      batchCount++;

      try {
        const response = await this.client.searchUsersBatch(currentPosition);
        const usersBatch = response?.UserInfoSearch?.UserInfo || [];

        if (usersBatch.length === 0) break;

        allUsers = [...allUsers, ...usersBatch];
        currentPosition += usersBatch.length;
        consecutiveErrors = 0;

        if (usersBatch.length < HIKVISION_CONFIG.batchSize) break;

        await new Promise(resolve => setTimeout(resolve, HIKVISION_CONFIG.delayBetweenBatches));

      } catch (error) {
        consecutiveErrors++;
        console.error(`Error en lote #${batchCount}: ${error.message}`);

        if (consecutiveErrors >= 2) {
          currentPosition += HIKVISION_CONFIG.batchSize;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (batchCount >= HIKVISION_CONFIG.maxBatches) {
      console.warn(`Se alcanzó el límite máximo de ${HIKVISION_CONFIG.maxBatches} lotes`);
    }

    return allUsers;
  }
}

export class HikvisionService {
  constructor() {
    this.userQueryService = new UserQueryService(
      new UserInfoClient(HIKVISION_CONFIG.deviceIp)
    );
  }

  async getAllUsersWithPagination() {
    return await this.userQueryService.getAllUsersWithPagination();
  }
}