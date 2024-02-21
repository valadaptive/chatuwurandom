import style from './style.scss';

import type {ComponentChildren, JSX} from 'preact';
import {useCallback, useEffect, useMemo, useRef} from 'preact/hooks';
import {batch, signal, useComputed, useSignal} from '@preact/signals';
import classNames from 'classnames';

import Icon from '../Icon/Icon';
import Indicator, {IndicatorState} from '../Indicator/Indicator';
import ContextMenu, {Item} from '../ContextMenu/ContextMenu';

import {StorageDirStatus, useAppState} from '../../app-state';
import Directory, {DirStatus} from '../../controller/signalize-fs';
import SaveFile from '../../controller/save-file';
import {Motif} from '../../util/motif';
import saveFileToDisk from '../../util/save-file';
import {useErrorToastAsync} from '../../hooks/error-toast';
import {TextHistory} from '../../controller/text-history';

// This is where I started to get tired of working on save file stuff. Apologies for the horrible code.

type PartialHandle = {
    kind: 'file' | 'directory',
    name: string,
};

/** UI element for a single entry (directory or file) in the tree. Includes child entries for directories. */
const Entry = <Handle extends PartialHandle>({
    handle,
    path,
    onClick,
    onRename,
    onDelete,
    onExport,
    isRenaming,
    onNameSet,
    indent,
    collapsed,
    selected,
    children
}: {
    handle: Handle,
    path: string,
    onClick?: (handle: Handle) => unknown,
    onRename?: (path: string, currentName: string) => unknown,
    onDelete?: (handle: Handle) => unknown,
    onExport?: (handle: Handle, path: string) => unknown,
    isRenaming?: boolean,
    onNameSet?: (handle: Handle, name: string) => unknown,
    indent: number,
    collapsed?: boolean,
    selected?: boolean,
    children?: ComponentChildren,
}): JSX.Element => {
    const handleClick = useCallback((event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick?.(handle);
    }, [onClick, handle]);

    const handleRename = useCallback(() => {
        onRename?.(path, handle.name);
    }, [onRename, handle]);

    const handleDelete = useCallback(() => {
        onDelete?.(handle);
    }, [onDelete, handle]);

    const handleExport = useCallback(() => {
        onExport?.(handle, path);
    }, [onExport, handle, path]);

    const handleNameSet = useCallback((event: Event) => {
        onNameSet?.(handle, (event.target as HTMLInputElement).value);
    }, [onNameSet, handle]);

    const handleCancelNameSet = useCallback(() => {
        onNameSet?.(handle, '');
    }, [onNameSet, handle]);

    const focusInput = useCallback((elem: HTMLInputElement | null) => {
        if (elem) elem.value = handle.name;
        elem?.focus();
    }, [handle]);

    const menuActive = useSignal(false);

    // No context menu options for directories right now
    const handleContextMenu = useCallback((event: Event) => {
        if (handle.kind === 'directory') return;
        event.preventDefault();
        event.stopPropagation();
        menuActive.value = true;
    }, [handle, menuActive]);

    const handleRenameKeyDown = useCallback((event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            onNameSet?.(handle, '');
            event.preventDefault();
        }
    }, [onNameSet, handle]);

    const indents = useMemo(() => {
        const indentElems = [];
        for (let i = 0; i < indent; i++) {
            indentElems.push(<div className={style.indent} />);
        }
        return indentElems;
    }, [indent]);

    // Used for context menu positioning
    const anchor = useRef(null);

    return (
        <div className={style.entry} onClick={handleClick} onContextMenu={handleContextMenu}>
            <ContextMenu relativeTo={anchor} active={menuActive}>
                <Item value="export" onClick={handleExport} icon="export">Export</Item>
                <Item value="rename" onClick={handleRename} icon="edit">Rename</Item>
                <Item value="delete" onClick={handleDelete} icon="close">Delete</Item>
            </ContextMenu>
            <div className={classNames(style.entryHeading, {[style.selected]: selected})} ref={anchor}>
                {indents}
                <div className={style.entryInfo}>
                    {typeof collapsed === 'boolean' ?
                        <Icon
                            className={style.entryIcon}
                            type={collapsed ? 'arrow-right' : 'arrow-down'}
                            title={collapsed ? 'Expand' : 'Collapse'}
                        /> :
                        null}
                    <Icon
                        className={style.entryIcon}
                        type={handle.kind === 'directory' ? 'folder' : 'file'}
                        title={handle.kind === 'directory' ? 'Folder' : 'File'}
                        motif={Motif.PRIMARY}
                    />
                    {isRenaming ?
                        <>
                            <input
                                type='text'
                                onChange={handleNameSet}
                                onKeyDown={handleRenameKeyDown}
                                ref={focusInput}
                                className={style.renameTextbox}
                            />
                            <Icon type="cancel" title="Cancel" onClick={handleCancelNameSet} />
                        </> :
                        <div>{handle.name === '' ? 'Root folder' : handle.name}</div>
                    }
                </div>
            </div>
            {!collapsed && children && <div className={style.subentries}>{children}</div>}
        </div>
    );
};

type PlaceholderSaveFile = {
    onNameSet: (handle: unknown, name: string) => unknown;
};

const DirectoryNode = ({
    dir,
    path,
    selectedPath,
    renamePath,
    onSelectFile,
    onRenameFile,
    onDeleteFile,
    onExportFile,
    onFileNameSet,
    placeholderSaveFile,
    indent = 0
}: {
    dir: Directory,
    path: string,
    selectedPath?: string,
    renamePath?: string,
    onSelectFile?: (handle: FileSystemFileHandle) => unknown,
    onRenameFile?: (path: string, currentName: string) => unknown,
    onDeleteFile?: (handle: FileSystemFileHandle, parent: Directory) => unknown,
    onExportFile?: (handle: FileSystemFileHandle, path: string) => unknown,
    onFileNameSet?: (handle: FileSystemFileHandle, parent: Directory, name: string) => unknown,
    placeholderSaveFile?: PlaceholderSaveFile,
    indent?: number
}): JSX.Element => {
    const collapsed = useSignal(false);

    const onClick = useCallback(() => {
        collapsed.value = !collapsed.value;
    }, [collapsed]);

    const handleRenameFile = useCallback((path: string, currentName: string) => {
        onRenameFile?.(path, currentName);
    }, [onRenameFile, dir]);

    const handleDeleteFile = useCallback((handle: FileSystemFileHandle) => {
        onDeleteFile?.(handle, dir);
    }, [onDeleteFile, dir]);

    const handleExportFile = useCallback((handle: FileSystemFileHandle, path: string) => {
        onExportFile?.(handle, path);
    }, [onExportFile]);

    const handleFileNameSet = useCallback((handle: FileSystemFileHandle, name: string) => {
        onFileNameSet?.(handle, dir, name);
    }, [onFileNameSet, dir]);

    return useMemo(() => {
        const directory = dir.value;
        const children = [];
        if (directory.status === DirStatus.TRAVERSED) {
            for (const entry of directory.entries) {
                if (entry instanceof Directory) {
                    children.push(<DirectoryNode
                        dir={entry}
                        path={`${path}/${entry.name}`}
                        key={`${path}/${entry.name}`}
                        selectedPath={selectedPath}
                        renamePath={renamePath}
                        onSelectFile={onSelectFile}
                        onRenameFile={onRenameFile}
                        onDeleteFile={onDeleteFile}
                        onExportFile={onExportFile}
                        onFileNameSet={onFileNameSet}
                        indent={indent + 1}
                    />);
                } else {
                    const entryPath = `${path}/${entry.name}`;
                    children.push(<Entry
                        handle={entry}
                        path={entryPath}
                        key={entryPath}
                        onClick={onSelectFile}
                        onRename={handleRenameFile}
                        isRenaming={renamePath === entryPath}
                        onDelete={handleDeleteFile}
                        onExport={handleExportFile}
                        onNameSet={handleFileNameSet}
                        selected={selectedPath === entryPath}
                        indent={indent + 1}
                    />);
                }
            }
        }

        if (placeholderSaveFile) {
            children.push(<Entry
                handle={{name: '', kind: 'file'}}
                path={`${path}//`}
                isRenaming={true}
                onNameSet={placeholderSaveFile.onNameSet}
                indent={indent + 1}
            />);
        }

        return (
            <Entry
                handle={dir.handle}
                path={path}
                onClick={onClick}
                collapsed={collapsed.value}
                indent={indent}
            >
                {children}
            </Entry>
        );
    }, [dir.value, selectedPath, renamePath, onSelectFile, collapsed.value, onClick, placeholderSaveFile]);

};

const FileView = (): JSX.Element => {
    const {storageDir, saveFile, chat} = useAppState();
    const wrapError = useErrorToastAsync();

    const getStorageDir = useCallback(async () => {
        storageDir.value = {status: StorageDirStatus.LOADING};
        try {
            await wrapError(() => navigator.storage.persist(), 'Storage permission was denied')();

            const handle = await navigator.storage.getDirectory();
            const directory = new Directory(handle);
            await saveFile.peek()?.close();
            storageDir.value = {status: StorageDirStatus.SET, directory, showPlaceholderSaveFile: signal(false)};
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            storageDir.value = {status: StorageDirStatus.FAILED, message};
        }
    }, [storageDir]);


    const onSelectFile = useCallback(async (handle: FileSystemFileHandle) => {
        // Necessary when loading the same file multiple times to avoid a race condition where the worker tries to close
        // the file *after* the new SaveFile has opened it to read it
        await saveFile.value?.close();
        const result = await wrapError(() => SaveFile.load(handle), 'Failed to load file')();
        if (!result) return;
        const {saveFile: newSaveFile, history} = result;
        batch(() => {
            saveFile.value = newSaveFile;
            chat.history.value = history;
        });
    }, [saveFile, chat.history]);

    const onDeleteFile = useCallback(async (file: FileSystemFileHandle, parent: Directory) => {
        const fileIsOpen = saveFile.value !== null && await file.isSameEntry(saveFile.value.fileHandle);
        if (fileIsOpen) {
            const oldSaveFile = saveFile.peek();
            saveFile.value = null;
            await oldSaveFile?.close();
        }
        await wrapError(() => parent.deleteFile(file.name), 'Failed to delete file')();
    }, []);

    // This unfortunately needs to be a promise because resolve is async. Once we know the save file path, we update the
    // signal's value.
    const saveFilePathPromise = useComputed(() => {
        if (!saveFile.value) return Promise.resolve(undefined);
        const storageState = storageDir.value;
        if (storageState.status !== StorageDirStatus.SET) return Promise.resolve(undefined);
        return storageState.directory.handle.resolve(saveFile.value.fileHandle).then(strings => {
            if (!strings) return undefined;
            return `/${strings.join('/')}`;
        });
    }).value;
    const saveFilePath = useSignal<string | undefined>(undefined);
    useEffect(() => {
        saveFilePath.value = undefined;
        void saveFilePathPromise.then(path => saveFilePath.value = path);
    }, [saveFilePathPromise, saveFilePath]);

    const renamedPath = useSignal<string | undefined>(undefined);
    const currentRenameTargetName = useRef<string | undefined>(undefined);
    const onRenameFile = useCallback((path: string, currentName: string) => {
        renamedPath.value = path;
        currentRenameTargetName.current = currentName;
    }, [renamedPath, currentRenameTargetName]);

    const onFileNameSet = useCallback((handle: FileSystemFileHandle, parent: Directory, name: string) => {
        renamedPath.value = undefined;
        const currentName = currentRenameTargetName.current;
        currentRenameTargetName.current = undefined;
        if (name === '' || name === currentName) return;
        void wrapError(() => parent.renameFile(handle, name), 'Failed to rename file')();
    }, [renamedPath, currentRenameTargetName]);

    const onExportFile = useCallback((handle: FileSystemFileHandle) => {
        void wrapError(async () => {
            const file = await handle.getFile();
            saveFileToDisk(file, handle.name, 'application/jsonl');
        }, 'Failed to export file')();
    }, [saveFilePath]);

    // If we have persistent storage permissions, initialize storage immediately
    useEffect(() => {
        navigator.storage.persisted()
            .then(isPersisted => {
                if (isPersisted) {
                    void getStorageDir();
                }
            })
            .catch(() => {});
    }, []);

    // Placeholder save file with no existing name; used when saving a file for the first time.
    const placeholderSaveFile = useComputed(() => {
        const showingPlaceholderSaveFile = storageDir.value.status === StorageDirStatus.SET ?
            storageDir.value.showPlaceholderSaveFile.value :
            false;

        if (!showingPlaceholderSaveFile) return;
        return {
            onNameSet (handle: unknown, name: string) {
                if (storageDir.value.status !== StorageDirStatus.SET) return;
                storageDir.value.showPlaceholderSaveFile.value = false;
                if (saveFile.value || name === '') return;
                const dir = storageDir.value.directory;

                void wrapError(async () => {
                    const file = await dir.createFile(name);
                    saveFile.value = SaveFile.fromExistingHistory(chat.history.value, file);
                }, 'Failed to create save file')();
            }
        };
    });

    const showPlaceholderSaveFile = useCallback(() => {
        if (storageDir.value.status !== StorageDirStatus.SET) return;
        storageDir.value.showPlaceholderSaveFile.value = true;
    }, [storageDir]);

    const createNewHistory = useCallback(async () => {
        await saveFile.value?.close();
        batch(() => {
            saveFile.value = null;
            chat.history.value = new TextHistory();
        });
    }, [saveFile]);

    const contents = useComputed(() => {
        const storageState = storageDir.value;
        switch (storageState.status) {
            case StorageDirStatus.NOT_SET: return (
                <div className={style.permissionRequest}>
                    <div>No persistent directory yet</div>
                    <div>
                        <button onClick={getStorageDir}>Load...</button>
                    </div>
                </div>
            );
            case StorageDirStatus.LOADING: return (
                <Indicator state={IndicatorState.LOADING} />
            );
            case StorageDirStatus.FAILED: return (
                <div className={style.storageDirError}>
                    <Icon type="error" title="Error" />
                    <div className={style.storageDirErrorMessage}>
                        Failed to get storage dir: {storageState.message}
                    </div>
                </div>
            );
            case StorageDirStatus.SET: {
                return (
                    <div>
                        <DirectoryNode
                            dir={storageState.directory}
                            path=''
                            selectedPath={saveFilePath.value}
                            renamePath={renamedPath.value}
                            onSelectFile={onSelectFile}
                            onRenameFile={onRenameFile}
                            onExportFile={onExportFile}
                            onDeleteFile={onDeleteFile}
                            onFileNameSet={onFileNameSet}
                            placeholderSaveFile={placeholderSaveFile.value}
                        />
                        <div className={style.saveButtonRow}>
                            {saveFile.value ?
                                <button onClick={createNewHistory}>New</button> :
                                <button onClick={showPlaceholderSaveFile}>Save</button>
                            }
                        </div>
                    </div>
                );
            }
        }
    }).value;

    return (
        <div className={style.fileView}>
            {contents}
        </div>
    );
};

export default FileView;
