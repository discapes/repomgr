import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

type RepoNode = {
	name: string;
	description: string | null;
	url: string;
	stargazerCount: number;
	primaryLanguage: { name: string } | null;
	homepageUrl: string | null;
	isPrivate: boolean;
	isFork: boolean;
	createdAt: string;
	diskUsage: number;
	owner: { login: string };
	defaultBranchRef: {
		target: {
			history: { totalCount: number };
		};
	} | null;
};

type GraphQLResponse = {
	data?: {
		viewer: {
			repositories: {
				totalCount: number;
				pageInfo: { hasNextPage: boolean; endCursor: string | null };
				nodes: RepoNode[];
			};
		};
	};
	errors?: { message: string }[];
};

export const POST: RequestHandler = async ({ request }) => {
	const { token } = await request.json();

	if (!token) {
		return json({ repos: [], error: 'Token required' }, { status: 400 });
	}

	const allRepos: RepoNode[] = [];
	let hasNextPage = true;
	let cursor: string | null = null;

	while (hasNextPage) {
		const query = `query($cursor: String) {
			viewer {
				repositories(first: 100, after: $cursor, ownerAffiliations: [OWNER, COLLABORATOR]) {
					totalCount
					pageInfo {
						hasNextPage
						endCursor
					}
					nodes {
						name
						description
						url
						stargazerCount
						primaryLanguage {
							name
						}
						homepageUrl
						isPrivate
						isFork
						createdAt
						diskUsage
						owner {
							login
						}
						defaultBranchRef {
							target {
								... on Commit {
									history {
										totalCount
									}
								}
							}
						}
					}
				}
			}
		}`;

		const res = await fetch('https://api.github.com/graphql', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
				'User-Agent': 'repomgr'
			},
			body: JSON.stringify({ query, variables: { cursor } })
		});

		console.log('GitHub API response status:', res.status);

		if (!res.ok) {
			const errorText = await res.text();
			console.error('GitHub API error response:', errorText);
			return json({ repos: [], error: `GitHub API error: ${res.status}` }, { status: res.status });
		}

		const result: GraphQLResponse = await res.json();

		if (result.errors?.length) {
			return json({ repos: [], error: result.errors[0].message }, { status: 400 });
		}

		const data = result.data?.viewer.repositories;
		if (!data) break;

		allRepos.push(...data.nodes);
		hasNextPage = data.pageInfo.hasNextPage;
		cursor = data.pageInfo.endCursor;
	}

	// Transform to match existing Repo type
	const repos = allRepos.map((r) => ({
		name: r.name,
		html_url: r.url,
		description: r.description,
		language: r.primaryLanguage?.name ?? null,
		fork: r.isFork,
		private: r.isPrivate,
		stargazers_count: r.stargazerCount,
		created_at: r.createdAt,
		size: r.diskUsage,
		owner: r.owner,
		commits: r.defaultBranchRef?.target?.history?.totalCount
	}));

	return json({ repos });
};
