import { withExponentialRetry } from '../../utils/retry.js';

interface LinearComment {
  id: string;
  body: string;
  user: {
    name: string;
  };
  createdAt: string;
}

export class LinearComments {
  private readonly apiUrl = 'https://api.linear.app/graphql';

  constructor(private readonly apiKey: string) {}

  async getComments(issueId: string): Promise<LinearComment[]> {
    const query = `
      query GetIssueComments($issueId: String!) {
        issue(id: $issueId) {
          comments {
            nodes {
              id
              body
              user {
                name
              }
              createdAt
            }
          }
        }
      }
    `;

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { issueId },
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch comments: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    const data = result as any;

    if (data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    }

    return data.data?.issue?.comments?.nodes || [];
  }

  async postComment(issueId: string, body: string): Promise<string> {
    const mutation = `
      mutation CreateComment($issueId: String!, $body: String!) {
        commentCreate(input: { issueId: $issueId, body: $body }) {
          success
          comment {
            id
          }
        }
      }
    `;

    const executePost = async () => {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: mutation,
          variables: { issueId, body },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to post comment: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      const data = result as any;

      if (data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
      }

      if (!data.data?.commentCreate?.success) {
        throw new Error('Failed to create comment');
      }

      return data.data.commentCreate.comment.id;
    };

    return withExponentialRetry(executePost, {
      maxRetries: 5,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
    });
  }

  async updateComment(commentId: string, body: string): Promise<void> {
    const mutation = `
      mutation UpdateComment($commentId: String!, $body: String!) {
        commentUpdate(id: $commentId, input: { body: $body }) {
          success
        }
      }
    `;

    const executeUpdate = async () => {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: mutation,
          variables: { commentId, body },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update comment: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      const data = result as any;

      if (data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
      }

      if (!data.data?.commentUpdate?.success) {
        throw new Error('Failed to update comment');
      }
    };

    await withExponentialRetry(executeUpdate, {
      maxRetries: 5,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
    });
  }
}
