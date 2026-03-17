/**
 * Base adapter interface. All source adapters extend this.
 */
export class BaseAdapter {
  /** @type {import('../types.js').SourceType} */
  static sourceType = "url";

  /**
   * Test whether this adapter can handle a given URL or input.
   * @param {string} url
   * @returns {boolean}
   */
  static canHandle(url) {
    return false;
  }

  /**
   * Scrape the URL and return a normalized InstructionSet.
   * @param {string} url
   * @param {Object} options - { project, outputDir }
   * @returns {Promise<import('../types.js').InstructionSet>}
   */
  async scrape(url, options = {}) {
    throw new Error("scrape() not implemented");
  }

  /**
   * Download all attachments to the local output directory.
   * @param {import('../types.js').InstructionSet} instructionSet
   * @param {string} outputDir
   * @returns {Promise<{downloaded: number, total: number}>}
   */
  async downloadAssets(instructionSet, outputDir) {
    throw new Error("downloadAssets() not implemented");
  }
}
