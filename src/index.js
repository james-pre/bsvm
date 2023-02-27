import * as fs from 'fs';
import { homedir } from 'os';
import path from 'path';
import { promisify } from 'util';
import { tagToVersion, releaseToVersion, copyGitDir } from './util.js';
import { exec as _exec } from 'child_process';
const exec = promisify(_exec);
const bsvm = { version: '0.0.1' }; //import bsvm from '../package.json' assert { type: 'json' };

const remote_repo = 'dr-vortex/blankstorm',
	local_install_path = path.join(homedir(), '.bsvm/'),
	local_config_path = path.join(local_install_path, 'config.json'),
	global_config_path = local_config_path;

//load config
export let config = {
	install_dir: path.join(local_install_path, 'versions'),
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

//load git
import * as git from 'isomorphic-git';
import * as http from 'isomorphic-git/http/node/index.js';
const git_options = {
	fs,
	http,
	dir: config.git_dir,
	url: `https://github.com/${remote_repo}.git`,
	author: {
		name: 'bsvm',
		email: '',
	},
};

export async function install(options) {
	console.log(`Installing BSVM (v${bsvm.version}) into ${local_install_path}...`);
	if (fs.existsSync(local_install_path) && !options.force) {
		console.log('BSVM installation already exists, use with --force or -f to force installation.');
		return;
	}

	if (options.verbose) console.log('Creating directories...');
	fs.mkdirSync(config.git_dir, { recursive: true });
	fs.mkdirSync(config.install_dir, { recursive: true });
	if (options.verbose) console.log('Writing empty config file...');
	fs.writeFileSync(local_config_path, '{}');
	if (options.verbose) console.log('Cloning git repository...');
	await git.clone(git_options);
	console.log('Installation successful!');
}

export async function update() {
	console.log('Auto-update support not added. Please check https://github.com/dr-vortex/bsvm/releases.');
}

export async function updateCache(options, onMessage = console.log) {
	if (options.verbose) console.log('Updating cache...');
	if (options.verbose) console.log('Fetching releases...');
	const res = await fetch(`https://api.github.com/repos/${remote_repo}/releases`);
	fs.writeFileSync(path.join(local_install_path, 'releases_cache.json'), await res.text());
	if (options.verbose) console.log('Pulling latest Blankstorm...');
	await git.fetch({ ...git_options, tags: true });
	await git.pull({ ...git_options, ref: 'main', onMessage });
	if (options.verbose) console.log('Done upating cache.');
}

export async function getVersions(options) {
	const versions = [];

	try {
		const content = fs.readFileSync(path.join(local_install_path, 'releases_cache.json'), { encoding: 'utf-8' });
		const releases = JSON.parse(content);
		for (let release of releases) {
			const version = releaseToVersion(release);
			versions.push(version);
		}
	} catch (err) {
		console.log('Could not load releases: release cache does not exist or is not valid JSON' + (options?.verbose ? `: ${err}.` : '.'));
	}

	try {
		const tagNames = await git.listTags(git_options);
		for (let tagName of tagNames) {
			const oid = await git.resolveRef({ ...git_options, ref: tagName });
			const object = await git.readObject({ ...git_options, oid, format: 'parsed' });

			if (object.type == 'tag') {
				const version = tagToVersion(object.object);
				const i = versions.findIndex(({ tag }) => tag == version.tag);
				if (i == -1) {
					versions.push(version);
				} else {
					Object.assign(versions[i], version);
				}
			} else if (options?.verbose) {
				versions.find(({ tag }) => tag == tagName).isLocal = true;
				console.log(`Warning: ${tagName}: not an annotated tag, can not parse as version.`);
			}
		}
	} catch (err) {
		console.log('Could not load tags' + (options?.verbose ? `: ${err}.` : '.'));
	}

	versions.sort((a, b) => a.time < b.time);

	return versions;
}

export function resolveVersions(versionsToResolve, versions) {
	return versionsToResolve.flatMap(_version => versions.filter(version => version.tag.includes(_version) || version.name.includes(_version)));
}

export async function installVersions(versions, options) {
	for (let version of versions) {
		try {
			const installPath = path.join(config.install_dir, version.tag);
			if (!version) {
				throw 'Version does not exist.';
			}

			if (options.verbose) console.log(`Checking out ${version.tag}...`);
			await git.checkout({ ...git_options, ref: version.tag });

			if (!fs.existsSync(path.join(config.git_dir, 'package.json'))) {
				//old version that does not use NPM

				if (options['no-copy']) {
					throw `Version has no "${options.mode}" command and no-copy option prevents copying.`;
				}

				copyGitDir(config.git_dir, installPath);
			} else {
				if (options.verbose) console.log('Checking for NPM...');
				const { stderr: checkError } = await exec(`${process.platform == 'win32' ? 'where' : 'which'} npm`);
				if (checkError) {
					throw 'Could not find NPM!' + (options.verbose ? `(${checkError})` : '');
				}

				console.log('Installing dependencies...');
				const { stderr: installError } = await exec('npm install', { cwd: config.git_dir });
				if (installError) {
					throw `Failed to install dependencies: ${installError}`;
				}

				if (options.verbose) console.log(`Checking for "${options.mode}" command...`);
				const content = fs.readFileSync(path.join(config.git_dir, 'package.json'), { encoding: 'utf-8' });
				let packageData;
				try {
					packageData = JSON.parse(content);
				} catch (err) {
					throw 'Invalid package.json (not JSON)';
				}

				if (!packageData.scripts[options.mode]) {
					console.log(`Could not find "${options.mode}" command${options['no-copy'] ? '. (not attempting to copy)' : ', copying instead...'}`);
					if (options['no-copy']) {
						throw `Version has no "${options.mode}" command and no-copy option prevents copying.`;
					}
					copyGitDir(config.git_dir, installPath);
				} else {
					console.log('Deploying...');
					const { stdout: deployOut, stderr: deployError } = await exec(
						`${packageData.scripts[options.mode]} ${options.verbose ? '--verbose' : ''} --outDir="${installPath}"`,
						{ cwd: config.git_dir }
					);
					if (deployError) {
						throw `Couldn't deploy: ${deployError}`;
					} else {
						if (options.verbose) console.log(`deploy: ${deployOut}`);
					}
				}
			}
		} catch (err) {
			console.log(`Failed to install version "${version.tag}"${options.verbose ? `: ${err}` : '.'}`);
		}
	}
}

export async function uninstallVersions(versions, options) {
	for (let version of versions) {
		try {
			const versionPath = path.join(config.install_dir, version);
			if (!fs.existsSync(versionPath)) {
				throw 'Version is not installed.';
			}

			console.log(`Uninstalling ${version}...`);
			fs.rmSync(versionPath, { recursive: true, force: true });
		} catch (err) {
			console.log(`Failed to uninstall version "${version}"${options.verbose ? `: ${err}` : '.'}`);
		}
	}
	console.log('Done!');
}

export function getConfigPath(options) {
	return options?.global ? global_config_path : local_config_path;
}

export function getConfig(key, options) {
	const configPath = getConfigPath(options);
	if (options.global) {
		console.log('Warning: global config is not supported yet.');
	}
	let _config = {};
	if (!fs.existsSync(configPath)) {
		if (options.verbose) console.log(`No config file found at ${configPath}, creating.`);
	} else {
		const content = fs.readFileSync(configPath, { encoding: 'utf-8' });
		Object.assign(_config, JSON.parse(content));
	}
	if (!Object.prototype.hasOwnProperty.call(_config, key)) {
		console.log(`Config property "${key}" is not set in ${configPath}`);
	} else {
		console.log(`${key}: ${_config[key]} (in ${configPath})`);
		return _config[key];
	}
}

export function setConfig(key, value, options) {
	const configPath = getConfigPath(options);
	if (options.global) {
		console.log('Warning: global config is not supported yet.');
	}
	let _config = {};
	if (!fs.existsSync(configPath)) {
		if (options.verbose) console.log(`No config file found at ${configPath}, creating.`);
	} else {
		const content = fs.readFileSync(configPath, { encoding: 'utf-8' });
		Object.assign(_config, JSON.parse(content));
	}
	_config[key] = value;
	config[key] = value;
	fs.writeFileSync(configPath, JSON.stringify(_config));
}
