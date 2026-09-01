const { create } = require('ipfs-http-client');
const axios = require('axios');
const FormData = require('form-data');
const logger = require('../utils/logger');

class IPFSService {
  constructor() {
    // Use Infura IPFS or Pinata
    this.projectId = process.env.IPFS_PROJECT_ID;
    this.projectSecret = process.env.IPFS_PROJECT_SECRET;

    if (this.projectId && this.projectSecret) {
      this.client = create({
        host: 'ipfs.infura.io',
        port: 5001,
        protocol: 'https',
        headers: {
          authorization: 'Basic ' + Buffer.from(`${this.projectId}:${this.projectSecret}`).toString('base64'),
        },
      });
    } else {
      logger.warn('IPFS credentials not set. File uploads will fail.');
    }
  }

  async uploadFile(buffer, filename) {
    try {
      if (!this.client) throw new Error('IPFS client not initialized');

      const result = await this.client.add({
        path: filename,
        content: buffer,
      });

      const cid = result.cid.toString();
      logger.info(`File uploaded to IPFS. CID: ${cid}`);

      return {
        cid,
        url: `https://ipfs.io/ipfs/${cid}`,
        gatewayUrl: `https://taskvault.infura-ipfs.io/ipfs/${cid}`,
      };
    } catch (error) {
      logger.error(`IPFS upload failed: ${error.message}`);
      throw error;
    }
  }

  async uploadJSON(data) {
    try {
      const buffer = Buffer.from(JSON.stringify(data));
      return await this.uploadFile(buffer, 'data.json');
    } catch (error) {
      logger.error(`IPFS JSON upload failed: ${error.message}`);
      throw error;
    }
  }

  async pinToPinata(cid) {
    // Optional: Pin to Pinata for redundancy
    try {
      await axios.post('https://api.pinata.cloud/pinning/pinByHash', {
        hashToPin: cid,
        pinataMetadata: { name: `taskvault-${Date.now()}` }
      }, {
        headers: { 
          pinata_api_key: process.env.PINATA_API_KEY,
          pinata_secret_api_key: process.env.PINATA_SECRET_KEY 
        }
      });
    } catch (error) {
      logger.warn(`Pinata pinning failed: ${error.message}`);
    }
  }
}

module.exports = new IPFSService();
