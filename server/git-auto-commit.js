import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function isGitRepo(cwd) {
  try {
    await access(path.join(cwd, ".git"));
    return true;
  } catch {
    return false;
  }
}

export async function autoCommit(projectPath, username) {
  try {
    if (!(await isGitRepo(projectPath))) {
      return { committed: false, message: "not a git repo" };
    }

    const { stdout: status } = await execFileAsync("git", ["status", "--porcelain"], {
      cwd: projectPath,
    });

    if (!status.trim()) {
      return { committed: false, message: "no changes" };
    }

    const changedFiles = status
      .trim()
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const fileCount = changedFiles.length;
    const timestamp = new Date().toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const commitMsg = `auto: Claude 会话结束 (${username}, ${timestamp}, ${fileCount}个文件)`;

    await execFileAsync("git", ["add", "-A"], { cwd: projectPath });
    await execFileAsync("git", ["commit", "-m", commitMsg], { cwd: projectPath });

    console.log(`[git-auto-commit] ${projectPath}: committed ${fileCount} files`);
    return { committed: true, message: commitMsg, fileCount };
  } catch (error) {
    console.error(
      `[git-auto-commit] ${projectPath}: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return {
      committed: false,
      error: error instanceof Error ? error.message : "unknown error",
    };
  }
}
