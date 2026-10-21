/**
 * GitHub API Client
 * Provides complete repository synchronization, authentication verification,
 * repository creation, branch fetching, and safe UTF-8 file uploads.
 */

export class GitHubClient {
  constructor(pat) {
    this.pat = pat ? pat.trim() : '';
    this.baseUrl = 'https://api.github.com';
  }

  /**
   * Common headers for GitHub API requests
   */
  getHeaders() {
    return {
      'Authorization': `Bearer ${this.pat}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  /**
   * Validates the personal access token and retrieves user metadata
   */
  async verifyAuth() {
    if (!this.pat) {
      throw new Error('GitHub Personal Access Token is empty.');
    }

    const response = await fetch(`${this.baseUrl}/user`, {
      headers: this.getHeaders()
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid or expired GitHub Personal Access Token.');
      }
      throw new Error(`GitHub Auth verification failed (${response.status}): ${response.statusText}`);
    }

    const user = await response.json();
    return {
      username: user.login,
      name: user.name || user.login,
      avatarUrl: user.avatar_url,
      htmlUrl: user.html_url
    };
  }

  /**
   * Fetches user's repositories
   */
  async listRepositories() {
    const response = await fetch(`${this.baseUrl}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator`, {
      headers: this.getHeaders()
    });

    if (!response.ok) {
      throw new Error(`Failed to list repositories: ${response.statusText}`);
    }

    const repos = await response.json();
    return repos.map(r => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      owner: r.owner.login,
      defaultBranch: r.default_branch,
      private: r.private,
      htmlUrl: r.html_url
    }));
  }

  /**
   * Creates a new repository for the authenticated user
   */
  async createRepository({ name = 'DSA', description = 'Automated DSA portfolio synced by AlgoSync AI', isPrivate = false }) {
    const response = await fetch(`${this.baseUrl}/user/repos`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        name,
        description,
        private: isPrivate,
        auto_init: true // initializes with README so default branch exists immediately
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Failed to create repository "${name}": ${err.message || response.statusText}`);
    }

    const repo = await response.json();
    return {
      name: repo.name,
      fullName: repo.full_name,
      owner: repo.owner.login,
      defaultBranch: repo.default_branch || 'main',
      htmlUrl: repo.html_url
    };
  }

  /**
   * Lists branches of a repository
   */
  async listBranches(owner, repo) {
    const response = await fetch(`${this.baseUrl}/repos/${owner}/${repo}/branches?per_page=100`, {
      headers: this.getHeaders()
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch branches for ${owner}/${repo}: ${response.statusText}`);
    }

    const branches = await response.json();
    return branches.map(b => b.name);
  }

  /**
   * Checks if a file exists and gets its SHA (needed for updating files)
   */
  async getFileSha(owner, repo, path, branch = 'main') {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const url = `${this.baseUrl}/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;

    const response = await fetch(url, { headers: this.getHeaders() });
    if (response.status === 200) {
      const data = await response.json();
      return data.sha;
    }
    return null;
  }

  /**
   * Encodes a UTF-8 string to base64 safely (handles unicode, emoji, code symbols)
   */
  static utf8ToBase64(str) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Uploads or updates a file in the user's GitHub repository
   */
  async uploadFile({ owner, repo, branch = 'main', path, content, commitMessage }) {
    if (!owner || !repo || !path || !content) {
      throw new Error('Missing required parameters for GitHub file upload.');
    }

    const existingSha = await this.getFileSha(owner, repo, path, branch);
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const url = `${this.baseUrl}/repos/${owner}/${repo}/contents/${encodedPath}`;

    const body = {
      message: commitMessage || `Auto-Sync: ${path}`,
      content: GitHubClient.utf8ToBase64(content),
      branch: branch
    };

    if (existingSha) {
      body.sha = existingSha;
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`GitHub Upload failed (${response.status}): ${err.message || response.statusText}`);
    }

    const result = await response.json();
    return {
      commitUrl: result.commit?.html_url || `https://github.com/${owner}/${repo}/commits/${branch}`,
      contentUrl: result.content?.html_url || `https://github.com/${owner}/${repo}/blob/${branch}/${path}`,
      sha: result.content?.sha
    };
  }
}
