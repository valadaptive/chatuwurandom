import style from './style.module.scss';

import type {JSX} from 'preact';
import {useRef} from 'preact/hooks';
import {useSignal} from '@preact/signals';

import {useAppState, ChatStatus} from '../../app-state';
import {useController} from '../../controller/context';
import type {Attachment} from '../../controller/message';
import Icon from '../Icon/Icon';

const MAX_ROWS = 25;

const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const ChatInputBox = (): JSX.Element => {
    const {chatBoxText, chat} = useAppState();
    const controller = useController();
    const fileInput = useRef<HTMLInputElement>(null);
    const attachments = useSignal<Attachment[]>([]);

    const onInput = (event: Event): void => {
        chatBoxText.value = (event.target as HTMLTextAreaElement).value;
    };

    const sendMessage = () => {
        if (chat.status.value === ChatStatus.IDLE && chatBoxText.value.trim().length > 0) {
            const files = attachments.value.length > 0 ? attachments.value : undefined;
            void controller.sendMessage(chatBoxText.value, files);
            attachments.value = [];
        }
    };

    const onKeyPress = (event: KeyboardEvent): void => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    };

    const onFilesSelected = (event: Event) => {
        const files = (event.target as HTMLInputElement).files;
        if (!files) return;
        const newAttachments = Array.from(files).map(f => ({name: f.name, size: f.size}));
        attachments.value = [...attachments.value, ...newAttachments];
        // Reset so the same file can be re-selected
        (event.target as HTMLInputElement).value = '';
    };

    const removeAttachment = (index: number) => {
        attachments.value = attachments.value.filter((_, i) => i !== index);
    };

    const isBusy = chat.status.value !== ChatStatus.IDLE;
    const hasAttachments = attachments.value.length > 0;

    return <div className={style.chatInputBox}>
        <div className={style.inputPill}>
            {hasAttachments && <div className={style.attachments}>
                {attachments.value.map((file, i) => (
                    <div key={`${file.name}-${i}`} className={style.fileChip}>
                        <span className={style.fileName}>{file.name}</span>
                        <span className={style.fileSize}>{formatSize(file.size)}</span>
                        <Icon type='close' title='Remove' onClick={() => removeAttachment(i)} />
                    </div>
                ))}
            </div>}
            <div className={style.inputRow}>
                <input
                    ref={fileInput}
                    type="file"
                    multiple
                    className={style.hiddenFileInput}
                    onChange={onFilesSelected}
                />
                <Icon type='attach' title='Attach files' onClick={() => fileInput.current?.click()} />
                <textarea
                    className={style.textbox}
                    value={chatBoxText}
                    onInput={onInput}
                    onKeyPress={onKeyPress}
                    placeholder="Message uwurandom..."
                    rows={Math.min((chatBoxText.value.match(/\n/g)?.length ?? 0) + 1, MAX_ROWS)}
                />
                <div className={style.buttons}>
                    {isBusy ?
                        <Icon type='cancel' title='Cancel' onClick={() => controller.cancelGeneration()}/> :
                        <Icon type='send' title='Send' onClick={sendMessage} />}
                </div>
            </div>
        </div>
    </div>;
};

export default ChatInputBox;
