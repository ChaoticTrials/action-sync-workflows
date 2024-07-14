import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';

const headers: Record<string, string> = {
  'Content-Type': 'application/json',
  Accept: 'application/vnd.github.v3+json',
  Authorization: `token ${core.getInput('token', { required: true })}`,
  'X-GitHub-Api-Version': '2022-11-28'
};

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const user = core.getInput('user');
    const org = core.getInput('org');
    const topic = core.getInput('topic', { required: true });
    const workflowDir = core.getInput('directory', { required: true });
    const commitPrefix = core.getInput('prefix') || '';

    if (!user && !org) {
      throw new Error('Either user or org must be provided.');
    }

    const repos = await getReposWithTopic(user, org, topic);

    for (const repoName of repos) {
      await syncWorkflowFiles(repoName, user || org, workflowDir, commitPrefix);
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}

async function getReposWithTopic(user: string, org: string, topic: string): Promise<string[]> {
  const reposWithTopic: string[] = [];
  let baseUrl: string;

  if (user && org) {
    throw new Error('Both user and org cannot be provided simultaneously.');
  }

  if (org) {
    baseUrl = `https://api.github.com/orgs/${org}/repos`;
  } else if (user) {
    baseUrl = `https://api.github.com/users/${user}/repos`;
  } else {
    throw new Error('Either user or org must be provided.');
  }

  try {
    let page = 1;
    let hasNextPage = true;

    while (hasNextPage) {
      let response = await fetch(`${baseUrl}?page=${page}&per_page=100`, {
        method: 'GET',
        headers: headers
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch repositories: ${response.statusText}`);
      }

      let repos = await response.json();

      // Exclude archived repositories
      repos = repos.filter((repo: any) => !repo.archived);

      for (let repo of repos) {
        let repoName: string = repo.name;
        let topics: string[] = await getRepoTopics(repoName, user || org);

        if (topics.includes(topic)) {
          reposWithTopic.push(repoName);
        }
      }

      // Check if there are more pages
      let linkHeader = response.headers.get('link');
      if (linkHeader) {
        hasNextPage = /rel="next"/.test(linkHeader);
      } else {
        hasNextPage = false;
      }

      page++;
    }

    return reposWithTopic;
  } catch (error) {
    if (error instanceof Error) {
      core.error(`Error fetching repositories: ${error.message}`);
    }

    throw error;
  }
}

async function getRepoTopics(repoName: string, owner: string): Promise<string[]> {
  const topicsUrl = `https://api.github.com/repos/${owner}/${repoName}/topics`;

  try {
    let response = await fetch(topicsUrl, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch topics for ${repoName}: ${response.statusText}`);
    }

    let topicsData = await response.json();
    return topicsData.names || [];
  } catch (error) {
    if (error instanceof Error) {
      core.error(`Error fetching topics for ${repoName}: ${error.message}`);
    }

    throw error;
  }
}

async function syncWorkflowFiles(
  repoName: string,
  owner: string,
  workflowDir: string,
  commitPrefix: string
): Promise<void> {
  const files = fs.readdirSync(workflowDir);
  const baseCommitSha = process.env.GITHUB_SHA;

  for (let file of files) {
    const filePath = path.join(workflowDir, file);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const base64Content = Buffer.from(fileContent).toString('base64');
    const permaLink = baseCommitSha
      ? `https://github.com/${owner}/${repoName}/blob/${baseCommitSha}/${filePath}`
      : `https://github.com/${owner}/${repoName}/blob/HEAD/${filePath}`;

    const fileEndpoint = `https://api.github.com/repos/${owner}/${repoName}/contents/.github/workflows/${file}`;

    try {
      // Check if the file already exists
      let response = await fetch(fileEndpoint, {
        method: 'GET',
        headers
      });

      if (response.status === 404) {
        // File does not exist, create it
        response = await fetch(fileEndpoint, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            message: `${commitPrefix} Create ${file}.\n\nSynced from ${permaLink}`.trim(),
            content: base64Content
          })
        });
      } else if (response.ok) {
        const existingFileData = await response.json();
        const sha = existingFileData.sha;

        // Skip file if existing content matches
        const existingContent = Buffer.from(existingFileData.content, 'base64').toString('utf8');
        if (existingContent === fileContent) {
          core.info(`Skipped syncing ${file} to ${repoName} as content matches.`);
          continue;
        }

        response = await fetch(fileEndpoint, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            message: `${commitPrefix} Update ${file}.\n\nSynced from ${permaLink}`.trim(),
            content: base64Content,
            sha
          })
        });
      }

      if (!response.ok) {
        throw new Error(`Failed to create/update ${file}: ${response.statusText}`);
      }

      core.info(`Successfully synced ${file} to ${repoName}`);
    } catch (error) {
      if (error instanceof Error) {
        core.error(`Error syncing ${file} to ${repoName}: ${error.message}`);
      }

      throw error;
    }
  }
}
