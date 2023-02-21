import * as fs from 'fs';
import * as path from 'path';

export function tagToVersion(tag){
	return {
		tag: tag.tag,
		name: tag.message,
		time: new Date(tag.tagger.timestamp),
	}
}

export function releaseToVersion(release){
	return {
		tag: release.tag_name,
		name: release.name,
		time: new Date(release.created_at),
	}
}

export function copyGitDir(from, to){
	fs.cpSync(from, to, { recursive: true, force: true });
	for(let name in [ '.git', 'node_modules', 'package.json', 'package-lock.json']){
		fs.rmSync(path.join(to, name), { recursive: true, force: true });
	}
}

export function updateLastLine(msg){
	process.stdout.clearLine(0);
	process.stdout.cursorTo(0);
	process.stdout.write(msg);
}