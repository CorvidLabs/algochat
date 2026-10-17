import { describe, expect, test } from 'bun:test';
import { SendQueue, InMemorySendQueueStorage } from './SendQueue.js';
import type { EnqueueOptions } from './SendQueue.js';

const defaultOpts: EnqueueOptions = {
    recipient: 'BOB_ADDRESS',
    recipientPublicKey: new Uint8Array(32).fill(0x01),
    content: 'hello',
};

function makeQueue(maxSize = 100): SendQueue {
    return new SendQueue(new InMemorySendQueueStorage(), maxSize);
}

describe('SendQueue', () => {
    describe('enqueue', () => {
        test('adds message with queued status', () => {
            const q = makeQueue();
            const msg = q.enqueue(defaultOpts);
            expect(msg.status).toBe('queued');
            expect(msg.content).toBe('hello');
            expect(msg.recipient).toBe('BOB_ADDRESS');
            expect(msg.retryCount).toBe(0);
            expect(msg.maxRetries).toBe(3);
            expect(msg.id).toMatch(/^pending-\d+$/);
        });

        test('assigns unique incrementing IDs', () => {
            const q = makeQueue();
            const m1 = q.enqueue(defaultOpts);
            const m2 = q.enqueue(defaultOpts);
            expect(m1.id).not.toBe(m2.id);
            const n1 = parseInt(m1.id.replace('pending-', ''));
            const n2 = parseInt(m2.id.replace('pending-', ''));
            expect(n2).toBeGreaterThan(n1);
        });

        test('respects custom maxRetries', () => {
            const q = makeQueue();
            const msg = q.enqueue({ ...defaultOpts, maxRetries: 10 });
            expect(msg.maxRetries).toBe(10);
        });

        test('throws when queue is full', () => {
            const q = makeQueue(2);
            q.enqueue(defaultOpts);
            q.enqueue(defaultOpts);
            expect(() => q.enqueue(defaultOpts)).toThrow(/full/i);
        });

        test('stores reply context', () => {
            const q = makeQueue();
            const msg = q.enqueue({
                ...defaultOpts,
                replyContext: { messageId: 'tx123', preview: 'original' },
            });
            expect(msg.replyContext?.messageId).toBe('tx123');
        });
    });

    describe('dequeue', () => {
        test('returns first queued message', () => {
            const q = makeQueue();
            q.enqueue({ ...defaultOpts, content: 'first' });
            q.enqueue({ ...defaultOpts, content: 'second' });
            expect(q.dequeue()?.content).toBe('first');
        });

        test('returns undefined when empty', () => {
            const q = makeQueue();
            expect(q.dequeue()).toBeUndefined();
        });

        test('skips non-queued messages', () => {
            const q = makeQueue();
            const m1 = q.enqueue({ ...defaultOpts, content: 'first' });
            q.enqueue({ ...defaultOpts, content: 'second' });
            q.markSending(m1.id);
            expect(q.dequeue()?.content).toBe('second');
        });
    });

    describe('status transitions', () => {
        test('markSending sets status and increments retry count', () => {
            const q = makeQueue();
            const msg = q.enqueue(defaultOpts);
            q.markSending(msg.id);
            const updated = q.get(msg.id)!;
            expect(updated.status).toBe('sending');
            expect(updated.retryCount).toBe(1);
            expect(updated.lastAttemptAt).toBeInstanceOf(Date);
        });

        test('markSent sets status and txid', () => {
            const q = makeQueue();
            const msg = q.enqueue(defaultOpts);
            q.markSending(msg.id);
            q.markSent(msg.id, 'TXID123');
            const updated = q.get(msg.id)!;
            expect(updated.status).toBe('sent');
            expect(updated.txid).toBe('TXID123');
            expect(updated.lastError).toBeUndefined();
        });

        test('markFailed re-queues if retries remain', () => {
            const q = makeQueue();
            const msg = q.enqueue({ ...defaultOpts, maxRetries: 3 });
            q.markSending(msg.id); // retryCount = 1
            q.markFailed(msg.id, 'network error');
            const updated = q.get(msg.id)!;
            expect(updated.status).toBe('queued');
            expect(updated.lastError).toBe('network error');
        });

        test('markFailed sets failed when max retries exceeded', () => {
            const q = makeQueue();
            const msg = q.enqueue({ ...defaultOpts, maxRetries: 1 });
            q.markSending(msg.id); // retryCount = 1
            q.markFailed(msg.id, 'network error');
            expect(q.get(msg.id)!.status).toBe('failed');
        });

        test('markSending on nonexistent id does nothing', () => {
            const q = makeQueue();
            q.markSending('nonexistent'); // should not throw
            expect(q.size).toBe(0);
        });

        test('markSent on nonexistent id does nothing', () => {
            const q = makeQueue();
            q.markSent('nonexistent', 'TX'); // should not throw
        });

        test('markFailed on nonexistent id does nothing', () => {
            const q = makeQueue();
            q.markFailed('nonexistent', 'err'); // should not throw
        });
    });

    describe('event callbacks', () => {
        test('onMessageSent fires on markSent', () => {
            const q = makeQueue();
            let called = false;
            q.setOnMessageSent((msg) => { called = true; expect(msg.txid).toBe('TX1'); });
            const m = q.enqueue(defaultOpts);
            q.markSending(m.id);
            q.markSent(m.id, 'TX1');
            expect(called).toBe(true);
        });

        test('onMessageFailed fires when retries remain', () => {
            const q = makeQueue();
            let called = false;
            q.setOnMessageFailed(() => { called = true; });
            const m = q.enqueue({ ...defaultOpts, maxRetries: 3 });
            q.markSending(m.id);
            q.markFailed(m.id, 'err');
            expect(called).toBe(true);
        });

        test('onMessageExpired fires when max retries exceeded', () => {
            const q = makeQueue();
            let called = false;
            q.setOnMessageExpired(() => { called = true; });
            const m = q.enqueue({ ...defaultOpts, maxRetries: 1 });
            q.markSending(m.id);
            q.markFailed(m.id, 'err');
            expect(called).toBe(true);
        });
    });

    describe('queue management', () => {
        test('remove deletes a message', () => {
            const q = makeQueue();
            const m = q.enqueue(defaultOpts);
            expect(q.remove(m.id)).toBe(true);
            expect(q.size).toBe(0);
        });

        test('remove returns false for nonexistent', () => {
            const q = makeQueue();
            expect(q.remove('nonexistent')).toBe(false);
        });

        test('purgeSent removes only sent messages', () => {
            const q = makeQueue();
            const m1 = q.enqueue(defaultOpts);
            q.enqueue(defaultOpts);
            q.markSending(m1.id);
            q.markSent(m1.id, 'TX');
            expect(q.purgeSent()).toBe(1);
            expect(q.size).toBe(1);
        });

        test('purgeFailed removes only failed messages', () => {
            const q = makeQueue();
            const m1 = q.enqueue({ ...defaultOpts, maxRetries: 0 });
            q.enqueue(defaultOpts);
            q.markSending(m1.id);
            q.markFailed(m1.id, 'err');
            expect(q.purgeFailed()).toBe(1);
            expect(q.size).toBe(1);
        });

        test('clear empties the queue', () => {
            const q = makeQueue();
            q.enqueue(defaultOpts);
            q.enqueue(defaultOpts);
            q.clear();
            expect(q.isEmpty).toBe(true);
        });

        test('retryFailed re-queues eligible failed messages', () => {
            const q = makeQueue();
            const m = q.enqueue({ ...defaultOpts, maxRetries: 3 });
            q.markSending(m.id);
            q.markFailed(m.id, 'err');
            // Message is re-queued by markFailed since retryCount(1) < maxRetries(3)
            // Manually set to failed to test retryFailed
            q.get(m.id)!.status = 'failed';
            expect(q.retryFailed()).toBe(1);
            expect(q.get(m.id)!.status).toBe('queued');
        });

        test('retryFailed skips messages at max retries', () => {
            const q = makeQueue();
            const m = q.enqueue({ ...defaultOpts, maxRetries: 1 });
            q.markSending(m.id); // retryCount = 1
            q.markFailed(m.id, 'err'); // status = 'failed'
            expect(q.retryFailed()).toBe(0); // retryCount(1) >= maxRetries(1)
        });
    });

    describe('properties', () => {
        test('size tracks total messages', () => {
            const q = makeQueue();
            expect(q.size).toBe(0);
            q.enqueue(defaultOpts);
            expect(q.size).toBe(1);
        });

        test('queuedCount counts only queued', () => {
            const q = makeQueue();
            const m = q.enqueue(defaultOpts);
            q.enqueue(defaultOpts);
            q.markSending(m.id);
            expect(q.queuedCount).toBe(1);
        });

        test('sendingCount counts only sending', () => {
            const q = makeQueue();
            const m = q.enqueue(defaultOpts);
            q.markSending(m.id);
            expect(q.sendingCount).toBe(1);
        });

        test('hasPending is true with queued or sending', () => {
            const q = makeQueue();
            expect(q.hasPending).toBe(false);
            q.enqueue(defaultOpts);
            expect(q.hasPending).toBe(true);
        });

        test('isFull returns true at max capacity', () => {
            const q = makeQueue(1);
            expect(q.isFull).toBe(false);
            q.enqueue(defaultOpts);
            expect(q.isFull).toBe(true);
        });

        test('getByStatus filters correctly', () => {
            const q = makeQueue();
            const m = q.enqueue(defaultOpts);
            q.enqueue(defaultOpts);
            q.markSending(m.id);
            expect(q.getByStatus('sending').length).toBe(1);
            expect(q.getByStatus('queued').length).toBe(1);
        });
    });

    describe('persistence', () => {
        test('save and load round-trip', async () => {
            const storage = new InMemorySendQueueStorage();
            const q1 = new SendQueue(storage);
            q1.enqueue(defaultOpts);
            q1.enqueue({ ...defaultOpts, content: 'second' });
            await q1.save();

            const q2 = new SendQueue(storage);
            await q2.load();
            expect(q2.size).toBe(2);
        });

        test('load restores id counter', async () => {
            const storage = new InMemorySendQueueStorage();
            const q1 = new SendQueue(storage);
            q1.enqueue(defaultOpts); // pending-1
            q1.enqueue(defaultOpts); // pending-2
            await q1.save();

            const q2 = new SendQueue(storage);
            await q2.load();
            const msg = q2.enqueue(defaultOpts);
            // New ID should be > 2
            const num = parseInt(msg.id.replace('pending-', ''));
            expect(num).toBeGreaterThan(2);
        });
    });

    describe('iteration', () => {
        test('getAll returns copy of all messages', () => {
            const q = makeQueue();
            q.enqueue(defaultOpts);
            q.enqueue(defaultOpts);
            const all = q.getAll();
            expect(all.length).toBe(2);
            all.pop(); // mutating copy doesn't affect queue
            expect(q.size).toBe(2);
        });

        test('Symbol.iterator enables for-of', () => {
            const q = makeQueue();
            q.enqueue({ ...defaultOpts, content: 'a' });
            q.enqueue({ ...defaultOpts, content: 'b' });
            const contents: string[] = [];
            for (const msg of q) {
                contents.push(msg.content);
            }
            expect(contents).toEqual(['a', 'b']);
        });
    });
});

describe('InMemorySendQueueStorage', () => {
    test('load returns empty array initially', async () => {
        const storage = new InMemorySendQueueStorage();
        expect(await storage.load()).toEqual([]);
    });

    test('save and load preserves messages', async () => {
        const storage = new InMemorySendQueueStorage();
        const msgs = [{
            id: 'pending-1',
            recipient: 'BOB',
            recipientPublicKey: new Uint8Array(32),
            content: 'test',
            status: 'queued' as const,
            retryCount: 0,
            maxRetries: 3,
            createdAt: new Date(),
        }];
        await storage.save(msgs);
        const loaded = await storage.load();
        expect(loaded.length).toBe(1);
        expect(loaded[0].content).toBe('test');
    });

    test('clear removes all messages', async () => {
        const storage = new InMemorySendQueueStorage();
        await storage.save([{
            id: 'pending-1',
            recipient: 'BOB',
            recipientPublicKey: new Uint8Array(32),
            content: 'test',
            status: 'queued' as const,
            retryCount: 0,
            maxRetries: 3,
            createdAt: new Date(),
        }]);
        await storage.clear();
        expect(await storage.load()).toEqual([]);
    });

    test('save creates a copy (not a reference)', async () => {
        const storage = new InMemorySendQueueStorage();
        const msgs = [{
            id: 'pending-1',
            recipient: 'BOB',
            recipientPublicKey: new Uint8Array(32),
            content: 'test',
            status: 'queued' as const,
            retryCount: 0,
            maxRetries: 3,
            createdAt: new Date(),
        }];
        await storage.save(msgs);
        msgs.pop();
        expect((await storage.load()).length).toBe(1);
    });
});
