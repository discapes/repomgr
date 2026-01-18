<script lang="ts">
	import './layout.css';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import {
		type ColumnDef,
		type ColumnFiltersState,
		type PaginationState,
		type SortingState,
		type VisibilityState,
		getCoreRowModel,
		getFilteredRowModel,
		getPaginationRowModel,
		getSortedRowModel
	} from '@tanstack/table-core';
	import { createRawSnippet } from 'svelte';
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import LinkIcon from '@lucide/svelte/icons/link';
	import XIcon from '@lucide/svelte/icons/x';
	import {
		FlexRender,
		createSvelteTable,
		renderSnippet
	} from '$lib/components/ui/data-table/index.js';

	type Repo = {
		name: string;
		html_url: string;
		description: string | null;
		language: string | null;
		fork: boolean;
		private: boolean;
		stargazers_count: number;
		created_at: string;
		size: number;
		owner: { login: string };
		commits?: number;
	};

	let token = $state('');
	let username = $state('');
	let repos: Repo[] = $state([]);
	let loading = $state(false);
	let error = $state('');

	let classes = $state<string[]>([]);
	let repoClasses = $state<Record<string, string>>({});
	let repoUrls = $state<Record<string, string[]>>({});
	let repoEnabled = $state<Record<string, boolean>>({});
	let repoDescriptions = $state<Record<string, string>>({});

	function repoKey(r: Repo) {
		return `${r.owner.login}/${r.name}`;
	}

	let pagination = $state<PaginationState>({ pageIndex: 0, pageSize: 200 });
	let sorting = $state<SortingState>([{ id: 'name', desc: false }]);
	let columnFilters = $state<ColumnFiltersState>([{ id: 'type', value: 'Sources' }]);
	let columnVisibility = $state<VisibilityState>({ owner: false });

	const languageCounts = $derived(
		repos.reduce(
			(acc, r) => {
				const lang = r.language ?? '(none)';
				acc[lang] = (acc[lang] || 0) + 1;
				return acc;
			},
			{} as Record<string, number>
		)
	);
	const languages = $derived(
		Object.keys(languageCounts)
			.filter((l) => l !== '(none)')
			.sort()
	);

	function getType(r: Repo) {
		return r.fork ? 'Fork' : r.private ? 'Private' : 'Public';
	}
	const typeCounts = $derived(
		repos.reduce(
			(acc, r) => {
				const type = getType(r);
				acc[type] = (acc[type] || 0) + 1;
				return acc;
			},
			{} as Record<string, number>
		)
	);
	const sourceCount = $derived((typeCounts['Public'] || 0) + (typeCounts['Private'] || 0));
	const types = ['Sources', 'Public', 'Private', 'Fork'] as const;

	const ownerCounts = $derived(
		repos.reduce(
			(acc, r) => {
				acc[r.owner.login] = (acc[r.owner.login] || 0) + 1;
				return acc;
			},
			{} as Record<string, number>
		)
	);
	const owners = $derived(Object.keys(ownerCounts).sort());

	const classCounts = $derived(
		repos.reduce(
			(acc, r) => {
				const cls = repoClasses[repoKey(r)] || '(none)';
				acc[cls] = (acc[cls] || 0) + 1;
				return acc;
			},
			{} as Record<string, number>
		)
	);
	const classesInData = $derived(
		Object.keys(classCounts)
			.filter((c) => c !== '(none)')
			.sort()
	);

	let languageFilter = $state('');
	let typeFilter = $state('Sources');
	let ownerFilter = $state('');
	let classFilter = $state('');

	const columns: ColumnDef<Repo>[] = [
		{
			id: 'enabled',
			header: 'Enabled',
			accessorFn: (row) => repoEnabled[repoKey(row)] ?? false,
			cell: ({ row }) => repoEnabled[repoKey(row.original)] ?? false
		},
		{
			id: 'owner',
			header: 'Owner',
			accessorFn: (row) => row.owner.login,
			cell: ({ row }) => row.original.owner.login
		},
		{
			accessorKey: 'name',
			header: 'Name',
			cell: ({ row }) => {
				const snippet = createRawSnippet<[{ name: string; url: string }]>((getData) => {
					const { name, url } = getData();
					return {
						render: () =>
							`<a href="${url}" target="_blank" class="text-blue-500 hover:underline">${name}</a>`
					};
				});
				return renderSnippet(snippet, { name: row.original.name, url: row.original.html_url });
			}
		},
		{
			id: 'pages_url',
			header: 'URL',
			accessorFn: (row) => (repoUrls[row.name] ?? []).join(', '),
			cell: ({ row }) => {
				const urls = repoUrls[row.original.name] ?? [];
				if (urls.length === 0) return '—';
				const first = urls[0];
				const extra = urls.length - 1;
				const snippet = createRawSnippet<[{ first: string; extra: number }]>((getData) => {
					const { first, extra } = getData();
					const href = first.startsWith('http') ? first : `https://${first}`;
					const extraText =
						extra > 0 ? `<span class="text-muted-foreground ms-1">(+${extra})</span>` : '';
					return {
						render: () =>
							`<span class="flex items-center gap-1"><a href="${href}" target="_blank" class="text-blue-500 hover:underline truncate max-w-32">${first}</a>${extraText}</span>`
					};
				});
				return renderSnippet(snippet, { first, extra });
			}
		},
		{
			accessorKey: 'language',
			header: 'Language',
			cell: ({ row }) => row.original.language ?? '',
			filterFn: (row, columnId, filterValue) => row.original.language === filterValue
		},
		{
			id: 'type',
			header: 'Type',
			accessorFn: (row) => getType(row),
			cell: ({ row }) => getType(row.original),
			filterFn: (row, columnId, filterValue) => {
				const type = getType(row.original);
				if (filterValue === 'Sources') {
					return type === 'Public' || type === 'Private';
				}
				return type === filterValue;
			}
		},
		{
			accessorKey: 'stargazers_count',
			header: 'Stars',
			cell: ({ row }) => row.original.stargazers_count
		},
		{
			accessorKey: 'commits',
			header: 'Commits',
			cell: ({ row }) => row.original.commits ?? '—'
		},
		{
			accessorKey: 'created_at',
			header: 'Created',
			cell: ({ row }) =>
				new Date(row.original.created_at).toLocaleDateString('en-US', {
					year: 'numeric',
					month: 'short'
				})
		},
		{
			accessorKey: 'size',
			header: 'Size',
			cell: ({ row }) => {
				const size = row.original.size;
				return size >= 1024 ? `${(size / 1024).toFixed(1)} MB` : `${size} KB`;
			}
		},
		{
			id: 'class',
			header: 'Class',
			accessorFn: (row) => repoClasses[repoKey(row)] ?? '',
			cell: ({ row }) => repoClasses[repoKey(row.original)] ?? '',
			filterFn: (row, columnId, filterValue) => {
				const cls = repoClasses[repoKey(row.original)] ?? '';
				if (filterValue === '(none)') return cls === '';
				return cls === filterValue;
			}
		},
		{
			id: 'description',
			header: 'Description',
			accessorFn: (row) => repoDescriptions[repoKey(row)] || row.description || '',
			cell: ({ row }) => {
				const key = repoKey(row.original);
				const customDesc = repoDescriptions[key];
				const desc = customDesc || row.original.description || '';
				const snippet = createRawSnippet<[{ desc: string; isCustom: boolean }]>((getData) => {
					const { desc, isCustom } = getData();
					const iconClass = isCustom
						? 'text-blue-500'
						: 'text-muted-foreground opacity-0 group-hover:opacity-100';
					return {
						render: () =>
							`<div class="group flex items-center gap-1 max-w-xs"><span class="truncate ${isCustom ? '' : 'text-muted-foreground'}">${desc || '—'}</span><span class="${iconClass} shrink-0">✎</span></div>`
					};
				});
				return renderSnippet(snippet, { desc, isCustom: !!customDesc });
			}
		}
	];

	const table = createSvelteTable({
		get data() {
			return repos;
		},
		columns,
		enableSortingRemoval: false,
		state: {
			get pagination() {
				return pagination;
			},
			get sorting() {
				return sorting;
			},
			get columnFilters() {
				return columnFilters;
			},
			get columnVisibility() {
				return columnVisibility;
			}
		},
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onPaginationChange: (updater) => {
			pagination = typeof updater === 'function' ? updater(pagination) : updater;
		},
		onSortingChange: (updater) => {
			sorting = typeof updater === 'function' ? updater(sorting) : updater;
		},
		onColumnFiltersChange: (updater) => {
			columnFilters = typeof updater === 'function' ? updater(columnFilters) : updater;
		},
		onColumnVisibilityChange: (updater) => {
			columnVisibility = typeof updater === 'function' ? updater(columnVisibility) : updater;
		}
	});

	onMount(() => {
		token = localStorage.getItem('repomgr_token') ?? '';
		username = localStorage.getItem('repomgr_username') ?? '';
		const saved = localStorage.getItem('repomgr_repos');
		if (saved) repos = JSON.parse(saved);
		const savedClasses = localStorage.getItem('repomgr_classes');
		if (savedClasses) classes = JSON.parse(savedClasses);
		const savedRepoClasses = localStorage.getItem('repomgr_repo_classes');
		if (savedRepoClasses) repoClasses = JSON.parse(savedRepoClasses);
		const savedRepoUrls = localStorage.getItem('repomgr_repo_urls');
		if (savedRepoUrls) {
			const parsed = JSON.parse(savedRepoUrls);
			// Migrate old single-string format to array format
			for (const key of Object.keys(parsed)) {
				if (typeof parsed[key] === 'string') {
					parsed[key] = parsed[key] ? [parsed[key]] : [];
				}
			}
			repoUrls = parsed;
		}
		const savedRepoEnabled = localStorage.getItem('repomgr_repo_enabled');
		if (savedRepoEnabled) repoEnabled = JSON.parse(savedRepoEnabled);
		const savedRepoDescriptions = localStorage.getItem('repomgr_repo_descriptions');
		if (savedRepoDescriptions) repoDescriptions = JSON.parse(savedRepoDescriptions);
	});

	function persist() {
		localStorage.setItem('repomgr_token', token);
		localStorage.setItem('repomgr_username', username);
		localStorage.setItem('repomgr_repos', JSON.stringify(repos));
	}

	function persistClasses() {
		localStorage.setItem('repomgr_classes', JSON.stringify(classes));
		localStorage.setItem('repomgr_repo_classes', JSON.stringify(repoClasses));
		localStorage.setItem('repomgr_repo_urls', JSON.stringify(repoUrls));
		localStorage.setItem('repomgr_repo_enabled', JSON.stringify(repoEnabled));
		localStorage.setItem('repomgr_repo_descriptions', JSON.stringify(repoDescriptions));
	}

	function exportClassData() {
		return JSON.stringify(
			{ classes, repoClasses, repoUrls, repoEnabled, repoDescriptions },
			null,
			2
		);
	}

	function importClassData(data: string) {
		try {
			const parsed = JSON.parse(data);
			if (parsed.classes) classes = parsed.classes;
			if (parsed.repoClasses) repoClasses = parsed.repoClasses;
			if (parsed.repoUrls) {
				// Migrate old single-string format to array format
				const urls = parsed.repoUrls;
				for (const key of Object.keys(urls)) {
					if (typeof urls[key] === 'string') {
						urls[key] = urls[key] ? [urls[key]] : [];
					}
				}
				repoUrls = urls;
			}
			if (parsed.repoEnabled) repoEnabled = parsed.repoEnabled;
			if (parsed.repoDescriptions) repoDescriptions = parsed.repoDescriptions;
			// Handle pages_urls.value format (legacy single-string format)
			if (parsed.pages_urls?.value) {
				for (const [key, value] of Object.entries(parsed.pages_urls.value)) {
					if (typeof value === 'string' && value) {
						repoUrls[key] = [...(repoUrls[key] || []), value];
					}
				}
			}
			persistClasses();
		} catch {}
	}

	async function copyToClipboard() {
		await navigator.clipboard.writeText(exportClassData());
	}

	async function pasteFromClipboard() {
		const text = await navigator.clipboard.readText();
		importClassData(text);
	}

	async function exportTableToClipboard() {
		const enabledRepos = repos.filter((r) => repoEnabled[repoKey(r)]);
		const data = enabledRepos.map((repo) => {
			const key = repoKey(repo);
			return {
				Enabled: true,
				Owner: repo.owner.login,
				Name: repo.name,
				URLs: repoUrls[repo.name] ?? [],
				Language: repo.language ?? '',
				Type: getType(repo),
				Stars: repo.stargazers_count,
				Commits: repo.commits ?? '',
				Created: repo.created_at,
				Size: repo.size,
				Class: repoClasses[key] ?? '',
				Description: repoDescriptions[key] || repo.description || ''
			};
		});
		await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
	}

	function downloadClassData() {
		const blob = new Blob([exportClassData()], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `repomgr-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function uploadClassData() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';
		input.onchange = async () => {
			const file = input.files?.[0];
			if (file) importClassData(await file.text());
		};
		input.click();
	}

	async function fetchRepos() {
		if (!token && !username) return;
		loading = true;
		error = '';
		try {
			if (token) {
				// Use GraphQL API via server endpoint (includes commit counts)
				const res = await fetch('/api/repos', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ token })
				});
				const result = await res.json();
				if (result.error) throw new Error(result.error);
				repos = result.repos;
			} else {
				// Fallback to REST API for public repos (no token)
				const baseUrl = `https://api.github.com/users/${username}/repos`;
				let allRepos: Repo[] = [];
				let page = 1;

				while (true) {
					const res = await fetch(`${baseUrl}?per_page=100&page=${page}`);
					if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
					const data: Repo[] = await res.json();
					allRepos = allRepos.concat(data);
					if (data.length < 100) break;
					page++;
				}
				repos = allRepos;
			}
			persist();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to fetch repos';
			repos = [];
		} finally {
			loading = false;
		}
	}
</script>

<div class="mx-auto max-w-6xl p-6">
	<h1 class="mb-6 text-2xl font-bold">Repository Manager</h1>

	<div class="mb-6 flex gap-4">
		<div class="flex-1">
			<Label for="token">Access Token (optional)</Label>
			<Input id="token" type="password" bind:value={token} onblur={persist} placeholder="ghp_..." />
		</div>
		<div class="flex-1">
			<Label for="username">Username</Label>
			<Input id="username" bind:value={username} onblur={persist} placeholder="octocat" />
		</div>
		<div class="self-end">
			<Button onclick={fetchRepos} disabled={loading || (!token && !username)}>
				{loading ? 'Loading...' : 'Fetch Repos'}
			</Button>
		</div>
	</div>

	{#if error}
		<p class="mb-4 text-red-500">{error}</p>
	{/if}

	<div class="mb-4 flex items-center gap-2">
		<Input
			placeholder="New class name..."
			class="w-48"
			onkeydown={(e) => {
				if (e.key === 'Enter' && e.currentTarget.value.trim()) {
					const name = e.currentTarget.value.trim();
					if (!classes.includes(name)) {
						classes = [...classes, name];
						persistClasses();
					}
					e.currentTarget.value = '';
				}
			}}
		/>
		<span class="flex items-center gap-1 text-sm text-muted-foreground">
			Classes:
			{#each classes as cls}
				<span class="inline-flex items-center rounded bg-muted py-0.5 ps-2 pe-1">
					{cls}
					<button
						class="ml-1 rounded p-1 hover:bg-destructive/20 hover:text-destructive"
						onclick={() => {
							classes = classes.filter((c) => c !== cls);
							persistClasses();
						}}>✕</button
					>
				</span>
			{:else}
				none
			{/each}
		</span>
		<div class="ms-auto flex gap-2">
			<Button variant="outline" size="sm" onclick={copyToClipboard}>Copy</Button>
			<Button variant="outline" size="sm" onclick={pasteFromClipboard}>Paste</Button>
			<Button variant="outline" size="sm" onclick={downloadClassData}>Download</Button>
			<Button variant="outline" size="sm" onclick={uploadClassData}>Upload</Button>
		</div>
	</div>

	<div class="flex items-center gap-4 py-4">
		<Input
			placeholder="Filter by name..."
			value={(table.getColumn('name')?.getFilterValue() as string) ?? ''}
			oninput={(e) => table.getColumn('name')?.setFilterValue(e.currentTarget.value)}
			class="max-w-48"
		/>
		<Select.Root
			type="single"
			value={ownerFilter}
			onValueChange={(v) => {
				ownerFilter = v ?? '';
				table.getColumn('owner')?.setFilterValue(v || undefined);
			}}
		>
			<Select.Trigger class="w-44">
				{ownerFilter ? `${ownerFilter} (${ownerCounts[ownerFilter]})` : 'Owner'}
			</Select.Trigger>
			<Select.Content>
				<Select.Item value="">All ({repos.length})</Select.Item>
				{#each owners as owner}
					<Select.Item value={owner}>{owner} ({ownerCounts[owner]})</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
		<Select.Root
			type="single"
			value={languageFilter}
			onValueChange={(v) => {
				languageFilter = v ?? '';
				table.getColumn('language')?.setFilterValue(v || undefined);
			}}
		>
			<Select.Trigger class="w-44">
				{languageFilter ? `${languageFilter} (${languageCounts[languageFilter]})` : 'Language'}
			</Select.Trigger>
			<Select.Content>
				<Select.Item value="">All ({repos.length})</Select.Item>
				{#each languages as lang}
					<Select.Item value={lang}>{lang} ({languageCounts[lang]})</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
		<Select.Root
			type="single"
			value={typeFilter}
			onValueChange={(v) => {
				typeFilter = v ?? '';
				table.getColumn('type')?.setFilterValue(v || undefined);
			}}
		>
			<Select.Trigger class="w-44">
				{typeFilter
					? `${typeFilter} (${typeFilter === 'Sources' ? sourceCount : typeCounts[typeFilter] || 0})`
					: 'Type'}
			</Select.Trigger>
			<Select.Content>
				<Select.Item value="">All ({repos.length})</Select.Item>
				{#each types as type}
					<Select.Item value={type}
						>{type} ({type === 'Sources' ? sourceCount : typeCounts[type] || 0})</Select.Item
					>
				{/each}
			</Select.Content>
		</Select.Root>
		<Select.Root
			type="single"
			value={classFilter}
			onValueChange={(v) => {
				classFilter = v ?? '';
				table.getColumn('class')?.setFilterValue(v || undefined);
			}}
		>
			<Select.Trigger class="w-44">
				{classFilter ? `${classFilter} (${classCounts[classFilter] || 0})` : 'Class'}
			</Select.Trigger>
			<Select.Content>
				<Select.Item value="">All ({repos.length})</Select.Item>
				{#if classCounts['(none)']}
					<Select.Item value="(none)">(none) ({classCounts['(none)']})</Select.Item>
				{/if}
				{#each classesInData as cls}
					<Select.Item value={cls}>{cls} ({classCounts[cls]})</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
		<Button variant="outline" class="ms-auto" onclick={exportTableToClipboard}>Export Table</Button>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props }: { props: Record<string, unknown> })}
					<Button {...props} variant="outline">
						Columns <ChevronDownIcon class="ms-2 size-4" />
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
				{#each table.getAllColumns().filter((col) => col.getCanHide()) as column (column.id)}
					<DropdownMenu.CheckboxItem
						class="capitalize"
						checked={column.getIsVisible()}
						onCheckedChange={(v: boolean) => column.toggleVisibility(v)}
					>
						{column.id}
					</DropdownMenu.CheckboxItem>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>

	<div class="rounded-md border">
		<Table.Root>
			<Table.Header>
				{#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
					<Table.Row>
						{#each headerGroup.headers as header (header.id)}
							<Table.Head
								class="cursor-pointer select-none"
								onclick={header.column.getToggleSortingHandler()}
							>
								{#if !header.isPlaceholder}
									<span class="inline-flex items-center gap-1">
										<FlexRender
											content={header.column.columnDef.header}
											context={header.getContext()}
										/>
										{#if header.column.getIsSorted() === 'asc'}
											<ChevronUpIcon class="size-4" />
										{:else if header.column.getIsSorted() === 'desc'}
											<ChevronDownIcon class="size-4" />
										{:else}
											<ChevronUpIcon class="size-4 opacity-0" />
										{/if}
									</span>
								{/if}
							</Table.Head>
						{/each}
					</Table.Row>
				{/each}
			</Table.Header>
			<Table.Body>
				{#each table.getRowModel().rows as row (row.id)}
					<Table.Row>
						{#each row.getVisibleCells() as cell (cell.id)}
							<Table.Cell
								class={cell.column.id === 'enabled' ? 'p-0' : ''}
								onclick={cell.column.id === 'enabled'
									? () => {
											repoEnabled[repoKey(row.original)] = !repoEnabled[repoKey(row.original)];
											repoEnabled = { ...repoEnabled };
											persistClasses();
										}
									: undefined}
							>
								{#if cell.column.id === 'enabled'}
									<div class="flex h-full w-full cursor-pointer items-center justify-center p-2">
										<input
											type="checkbox"
											class="pointer-events-none size-5"
											checked={repoEnabled[repoKey(row.original)] ?? false}
											tabindex="-1"
										/>
									</div>
								{:else if cell.column.id === 'pages_url'}
									{@const repoName = row.original.name}
									{@const urls = repoUrls[repoName] ?? []}
									{@const firstUrl = urls[0] ?? ''}
									{@const extraCount = urls.length > 1 ? urls.length - 1 : 0}
									<Popover.Root>
										<Popover.Trigger
											class="group flex w-full cursor-pointer items-center gap-1 text-left"
										>
											{#if firstUrl}
												<a
													href={firstUrl.startsWith('http') ? firstUrl : `https://${firstUrl}`}
													target="_blank"
													class="max-w-32 truncate text-blue-500 hover:underline"
													onclick={(e) => e.stopPropagation()}>{firstUrl}</a
												>
												{#if extraCount > 0}
													<span class="text-muted-foreground">(+{extraCount})</span>
												{/if}
											{:else}
												<span class="text-muted-foreground">—</span>
											{/if}
											<LinkIcon
												class="size-3 shrink-0 {urls.length > 0
													? 'text-blue-500'
													: 'text-muted-foreground opacity-0 group-hover:opacity-100'}"
											/>
										</Popover.Trigger>
										<Popover.Content class="w-80">
											<div class="space-y-3">
												<div class="text-sm font-medium">URLs</div>
												{#each urls as url, i}
													<div class="flex items-center gap-2">
														<Input
															class="h-8 flex-1 text-sm"
															value={url}
															oninput={(e) => {
																const newUrls = [...urls];
																newUrls[i] = e.currentTarget.value;
																repoUrls[repoName] = newUrls;
																repoUrls = { ...repoUrls };
																persistClasses();
															}}
														/>
														<Button
															variant="ghost"
															size="sm"
															class="h-8 w-8 p-0"
															onclick={() => {
																const newUrls = urls.filter((_, idx) => idx !== i);
																repoUrls[repoName] = newUrls;
																repoUrls = { ...repoUrls };
																persistClasses();
															}}
														>
															<XIcon class="size-4" />
														</Button>
													</div>
												{/each}
												<Input
													class="h-8 text-sm"
													placeholder="Add URL..."
													onkeydown={(e) => {
														if (e.key === 'Enter' && e.currentTarget.value.trim()) {
															repoUrls[repoName] = [...urls, e.currentTarget.value.trim()];
															repoUrls = { ...repoUrls };
															persistClasses();
															e.currentTarget.value = '';
														}
													}}
												/>
											</div>
										</Popover.Content>
									</Popover.Root>
								{:else if cell.column.id === 'description'}
									{@const key = repoKey(row.original)}
									{@const customDesc = repoDescriptions[key] ?? ''}
									{@const originalDesc = row.original.description ?? ''}
									{@const displayDesc = customDesc || originalDesc}
									<Popover.Root>
										<Popover.Trigger
											class="group flex w-full max-w-xs cursor-pointer items-center gap-1 text-left"
										>
											<span class="truncate {customDesc ? '' : 'text-muted-foreground'}"
												>{displayDesc || '—'}</span
											>
											<PencilIcon
												class="size-3 shrink-0 {customDesc
													? 'text-blue-500'
													: 'text-muted-foreground opacity-0 group-hover:opacity-100'}"
											/>
										</Popover.Trigger>
										<Popover.Content class="w-80">
											<div class="space-y-3">
												<div class="text-sm font-medium">Edit Description</div>
												{#if originalDesc}
													<div class="text-xs text-muted-foreground">
														<span class="font-medium">Original:</span>
														{originalDesc}
													</div>
												{/if}
												<textarea
													class="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm"
													rows="3"
													placeholder="Custom description..."
													value={customDesc}
													oninput={(e) => {
														repoDescriptions[key] = e.currentTarget.value;
														repoDescriptions = { ...repoDescriptions };
														persistClasses();
													}}
												></textarea>
												{#if customDesc}
													<Button
														variant="outline"
														size="sm"
														class="w-full"
														onclick={() => {
															delete repoDescriptions[key];
															repoDescriptions = { ...repoDescriptions };
															persistClasses();
														}}
													>
														Clear Override
													</Button>
												{/if}
											</div>
										</Popover.Content>
									</Popover.Root>
								{:else if cell.column.id === 'class'}
									<Select.Root
										type="single"
										value={repoClasses[repoKey(row.original)] ?? ''}
										onValueChange={(v) => {
											repoClasses[repoKey(row.original)] = v ?? '';
											repoClasses = { ...repoClasses };
											persistClasses();
										}}
									>
										<Select.Trigger class="h-7 w-32">
											{repoClasses[repoKey(row.original)] || '—'}
										</Select.Trigger>
										<Select.Content>
											<Select.Item value="">None</Select.Item>
											{#each classes as cls}
												<Select.Item value={cls}>{cls}</Select.Item>
											{/each}
										</Select.Content>
									</Select.Root>
								{:else}
									<FlexRender content={cell.column.columnDef.cell} context={cell.getContext()} />
								{/if}
							</Table.Cell>
						{/each}
					</Table.Row>
				{:else}
					<Table.Row>
						<Table.Cell colspan={columns.length} class="h-24 text-center">No results.</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>

	<div class="flex items-center justify-end space-x-2 pt-4">
		<div class="flex-1 text-sm text-muted-foreground">
			{table.getFilteredRowModel().rows.length} repositories
		</div>
		<div class="space-x-2">
			<Button
				variant="outline"
				size="sm"
				onclick={() => table.previousPage()}
				disabled={!table.getCanPreviousPage()}
			>
				Previous
			</Button>
			<Button
				variant="outline"
				size="sm"
				onclick={() => table.nextPage()}
				disabled={!table.getCanNextPage()}
			>
				Next
			</Button>
		</div>
	</div>
</div>
