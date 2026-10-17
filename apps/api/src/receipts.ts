import { ReceiptQuerySchema, ReceiptReadSchema, type Actor } from '@cornerstone/contracts';
import { DomainError } from '@cornerstone/domain';
import { canRead } from '@cornerstone/security';
import { Store } from '@cornerstone/store';
/** A retained receipt never overrides revoked current record access. */
export class ReceiptReader {
  constructor(readonly store: Store) {}
  async read(actor: Actor, input: unknown) {
    const { receiptId } = ReceiptQuerySchema.parse(input);
    return this.store.transaction(actor, async (tx) => {
      const receipt = await this.store.ownReceipt(tx, actor, receiptId);
      const record = receipt ? await this.store.get(tx, receipt.recordId) : null;
      if (
        actor.realm !== 'simulation' ||
        !receipt ||
        !record ||
        record.realm !== receipt.realm ||
        record.version < receipt.version ||
        !canRead(actor, record, await this.store.grants(tx, record.id), new Date().toISOString())
      )
        throw new DomainError('NOT_FOUND', 'Receipt not found or no longer accessible.', 404);
      // Do not return record contents, other actors' receipts, request keys or audit internals.
      return ReceiptReadSchema.parse({
        context: { actorId: actor.id, realm: actor.realm },
        receipt,
      });
    });
  }
}
