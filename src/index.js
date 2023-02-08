import * as fs from 'fs';
import { homedir } from 'os';
import path from 'path';
import { parseArgs } from 'util';
const bsvm = { version: '0.0.1' }; //import bsvm from '../package.json' assert { type: 'json' };

const remote_repo = 'dr-vortex/blankstorm',
	local_install_path = path.join(homedir(), '.bsvm/'),
	local_config_path = path.join(local_install_path, 'config.json'),
	global_config_path = local_config_path;

//load config
let config = {
	install_dir: path.join(local_install_path, 'installed'),
	git_dir: path.join(local_install_path, 'repo'),
};
if (fs.existsSync(local_config_path)) {
	const content = fs.readFileSync(local_config_path, { encoding: 'utf-8' });
	Object.assign(config, JSON.parse(content));
}
if (fs.existsSync(global_config_path)) {
	const content = fs.readFileSync(global_config_path, { encoding: 'utf-8' });
	Object.assign(config, JSON.parse(content));
}

const _args = parseArgs({
	options: {
		//BVM management
		help: { short: 'h', type: 'boolean' },
		version: { type: 'boolean' },
		update: { type: 'boolean' },
		install: { type: 'boolean' },

		//Command options
		verbose: { short: 'v', type: 'boolean' },
		force: { short: 'f', type: 'boolean' },
		'dry-run': { short: 'd', type: 'boolean' },
		installDir: { short: 'i', type: 'string' },
		mode: { short: 'm', type: 'string' },
		global: { short: 'g', type: 'boolean' },
		all: { short: 'a', type: 'boolean' },
	},
	allowPositionals: true,
});

const args = _args.positionals,
	options = {
		//BVM management
		help: false,
		version: false,
		update: false,
		install: false,

		//Command options
		verbose: false,
		force: false,
		'dry-run': false,
		installDir: config.install_dir,
		mode: 'deploy',
		global: false,
		all: false,
		..._args.values,
	};

import * as git from 'isomorphic-git';
import * as http from 'isomorphic-git/http/node/index.js';
const git_options = {
	fs,
	http,
	dir: config.git_dir,
	dryRun: options['dry-run'],
};

const verboseLog = (...data) => {
	if (options.verbose) {
		console.log(...data);
	}
};

const updateLastLine = (msg, verbose) => {
	if(!verbose || options.verbose){
		process.stdout.clearLine(0);
		process.stdout.cursorTo(0);
		process.stdout.write(msg);
	}
};

const getVersions = async () => {
	verboseLog('Fetching releases...');
	const res = await fetch(`https://api.github.com/repos/${remote_repo}/releases`);
	return await res.json();
};

if (options.version) {
	console.log(`BSVM v${bsvm.version}`);
	process.exit();
}

if (options.help) {
	console.log(`BSVM usage:
	bsvm (--help | -h): Print this help message
	bsvm --version: Print the current version of BSVM
	bsvm --install: Install BSVM
	bsvm --update: Update BSVM (Not implemented yet)

	bsvm install [<version> ...]: installs the specified versions
	bsvm uninstall [<version> ...]: uninstalls the specified versions
	`);
	process.exit();
}

if (options.install) {
	console.log(`Installing BSVM (v${bsvm.version}) into ${local_install_path}...`);
	if (fs.existsSync(local_install_path) && !options.force) {
		console.log('BSVM installation already exists, use with --force or -f to force installation.');
		process.exit();
	}

	verboseLog('Creating directories...');
	fs.mkdirSync(path.join(local_install_path, 'repo'), { recursive: true });
	verboseLog('Writing empty config file...');
	fs.writeFileSync(local_config_path, '{}');
	verboseLog('Cloning git repository...');
	await git.clone({ ...git_options, url: `https://github.com/${remote_repo}.git`, onMessage: msg => updateLastLine(msg, true) });
	console.log('Installation successful!');
	process.exit();
}

if (options.update) {
	console.log('CLI Update support not added. Please check https://github.com/dr-vortex/bsvm/releases');
}

switch (args[0]) {
	case 'install':
		for (let version of args.slice(1)) {
			try {
				const versions = await getVersions();
				const versionData = versions.find(_version => _version.tag_name == version || _version.name == version);
				if (!versionData) {
					throw 'Version does not exist.';
				}

				verboseLog('Checking out tag...');
				await git.checkout({ ...git_options, ref: versionData.tag_name });

				verboseLog('Checking for install command...');
			} catch (err) {
				console.log(`Failed to install version "${version}": ${err}`);
			}
		}
		console.log('Done!');
		break;
	case 'uninstall':
		for (let version of args.slice(1)) {
			try {
				const versionPath = path.join(config.install_dir, version);
				if (!fs.existsSync(versionPath)) {
					throw 'Version is not installed.';
				}

				console.log(`Uninstalling ${version}...`);
				fs.rmdirSync(versionPath, { recursive: true, force: true });
			} catch (err) {
				console.log(`Failed to uninstall version "${version}": ${err}`);
			}
		}
		console.log('Done!');
		break;
	case 'list':
		const versions = await getVersions();
		for (let version of versions) {
			const isInstalled = fs.existsSync(path.join(config.install_dir, version.tag_name));

			if (options.all) {
				console.log(`${version.name} <${version.tag_name}> ${isInstalled ? '(installed)' : ''}`);
			} else if (isInstalled) {
				console.log(`${version.name} <${version.tag_name}>`);
			}
		}
		break;
	case 'config':
		const configPath = options.global ? global_config_path : local_config_path;
		if (options.global) {
			console.log('Warning: global config is not supported yet.');
		}
		let _config = {};
		if (!fs.existsSync(configPath)) {
			verboseLog(`No config file found at ${configPath}, creating.`);
		} else {
			const content = fs.readFileSync(configPath, { encoding: 'utf-8' });
			Object.assign(_config, JSON.parse(content));
		}
		_config[args[1]] = args[2];
		fs.writeFileSync(configPath, JSON.stringify(_config));
		break;
	default:
		console.log(`Unsupported command: "${args[0]}"`);
}
