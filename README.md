# action-sync-workflows

This GitHub Action syncs workflow files to repositories with a specified topic, either for a user or an organization.

## Usage

This action fetches repositories with a specified topic from a user or organization, and then syncs workflow files from
a specified directory to those repositories. If the file already exists and matches the content, it will be skipped.

### Inputs

|       Name        |                        Description                         |      Required       | Default |
| :---------------: | :--------------------------------------------------------: | :-----------------: | :-----: |
| `user` \|\| `org` | GitHub username or organization to fetch repositories from | Exactly one of them |         |
|      `topic`      |            The topic to filter repositories by             |         Yes         |         |
|    `directory`    |      The directory containing workflow files to sync       |         Yes         |         |
|     `prefix`      |               Optional commit message prefix               |         No          |         |
|      `token`      |              GitHub token for authentication               |         Yes         |         |

### Example Workflow

```yaml
name: Sync Workflow Files

on: [push]

jobs:
  sync:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v2

      - name: Sync Workflow Files
        uses: ChaoticTrials/action-sync-workflows@v1
        with:
          user: 'your-username'
          org: 'your-org'
          topic: 'your-topic'
          directory: '.github/workflows'
          prefix: '[Sync]'
          token: ${{ secrets.GITHUB_TOKEN }}
```
