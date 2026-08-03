/**
 * The unmapped experience. When the compiler refuses a sentence, the human
 * needs three things immediately: which sentence, what the rule set *can*
 * express near it, and a concrete rewrite to try.
 *
 * This is a static keyword table, deliberately. It is authoring help, not
 * enforcement, and it runs at review time — but making it a model call would
 * blur the one line this project cares about, so it stays code a reader can
 * audit in a minute.
 */
export interface Guidance {
  /** What the closed rule set can express in the same territory. */
  readonly canExpress: readonly string[];
  /** A concrete rewrite the human can paste and edit. */
  readonly suggestion: string;
}

interface Topic {
  readonly keywords: readonly string[];
  readonly guidance: Guidance;
}

const TOPICS: readonly Topic[] = [
  {
    keywords: ['history', 'rebase', 'amend', 'squash', 'rewrite'],
    guidance: {
      canExpress: [
        'a named command with a named flag, in any argument order (git commit --amend, git reset --hard)',
        'a named command with a named subcommand (git rebase)',
      ],
      suggestion:
        'Never rewrite history: no git rebase, no git commit --amend, no git reset --hard.',
    },
  },
  {
    keywords: ['install', 'dependency', 'dependencies', 'package', 'library'],
    guidance: {
      canExpress: ['a named package manager with its install subcommands and aliases'],
      suggestion: 'Don\'t install new dependencies with npm — no npm install, no npm i, no npm add.',
    },
  },
  {
    keywords: ['production', 'prod', 'staging', 'live', 'deploy'],
    guidance: {
      canExpress: [
        'protected directory names (anything inside a directory called prod)',
        'a positive writable area (only write inside src and tests)',
      ],
      suggestion: 'Never touch anything inside a directory called prod or infra.',
    },
  },
  {
    keywords: ['secret', 'secrets', 'credential', 'credentials', 'key', 'token', 'password'],
    guidance: {
      canExpress: ['protected file names and protected file endings (.pem, .key)'],
      suggestion: 'Never touch private keys or certificates — anything ending in .pem or .key.',
    },
  },
  {
    keywords: ['ask', 'approve', 'approval', 'permission', 'confirm', 'check with'],
    guidance: {
      canExpress: ['a flat refusal — this system has exactly two verdicts, ALLOW and DENY'],
      suggestion:
        'Decide which half you mean and state it as a refusal, e.g. "Never delete anything outside the project." An "ask me first" step would need an approval verdict this system deliberately does not have.',
    },
  },
  {
    // Phrase-level on purpose: a bare "create" appears in perfectly
    // expressible sentences ("don't create anything outside the project").
    keywords: ["didn't create", 'did not create', "didn't write", 'you created', 'you wrote', 'someone else', 'owned by', 'provenance', 'author'],
    guidance: {
      canExpress: ['rules about the path itself — where it is, what it is named, what it ends in'],
      suggestion:
        'Name the files or directories instead of their history, e.g. "Never delete anything inside vendor or node_modules." Provenance is not visible to the evaluator, which reads the action alone.',
    },
  },
  {
    keywords: ['cost', 'money', 'spend', 'billing', 'paid', 'expensive'],
    guidance: {
      canExpress: ['which hosts may be reached, and which HTTP methods are allowed'],
      suggestion:
        'Name the endpoints, e.g. "The only hosts you may reach are api.github.com and registry.npmjs.org." What something costs is not decidable from the action.',
    },
  },
  {
    keywords: ['files at once', 'more than', 'at most', 'limit', 'many', 'bulk'],
    guidance: {
      canExpress: ['rules about one action in isolation — the evaluator holds no history'],
      suggestion:
        'State the boundary as a place rather than a count, e.g. "Only write inside src and tests." A limit across several actions would need state the evaluator deliberately does not keep.',
    },
  },
];

const GENERIC: Guidance = {
  canExpress: [
    'where files may be created, overwritten or deleted (inside the project; inside named directories)',
    'file names and file endings that are off limits',
    'shell commands by forbidden word, by adjacent word pair, or by command + subcommand + flag',
    'which hosts may be reached and which HTTP methods are allowed',
  ],
  suggestion:
    'Rewrite the sentence to name the concrete thing to refuse — a path, a file name, a command and its flag, or a host.',
};

/**
 * Guidance for one unmapped sentence. Every matching topic contributes,
 * because the sentences that fail are usually bundles — "never rewrite
 * history, and don't delete anything you didn't create" is two different
 * problems, and showing only the first would send the human round the loop
 * twice.
 */
export function guidanceFor(sentence: string): Guidance {
  const haystack = sentence.toLowerCase();
  const matched = TOPICS.filter((topic) => topic.keywords.some((keyword) => haystack.includes(keyword)));
  if (matched.length === 0) return GENERIC;
  return {
    canExpress: [...new Set(matched.flatMap((topic) => topic.guidance.canExpress))],
    suggestion: matched.map((topic) => topic.guidance.suggestion).join('\n'),
  };
}
