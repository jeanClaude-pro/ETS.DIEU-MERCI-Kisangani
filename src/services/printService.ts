const API_BASE = import.meta.env.VITE_API_URL;

export interface PrintReceiptData {
  shopName: string;
  shopAddress: string;
  shopNumber: string;
  shopRegistration: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  items: Array<{
    name: string;
    quantity: number;
    total: number;
  }>;
  total: number;
  paymentMethod: string;
  salesPerson: string;
  date: string;
  receiptNumber: number;
  stubNumber: number;
}

export class PrintService {
  static async printReceipt(receiptData: PrintReceiptData, type: 'sale' | 'reservation' = 'sale'): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE}/print/receipt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({ receiptData, type }),
      });

      if (!response.ok) {
        throw new Error('Failed to print receipt');
      }

      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('Print receipt error:', error);
      throw error;
    }
  }

  static async printStub(receiptData: PrintReceiptData, type: 'sale' | 'reservation' = 'sale'): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE}/print/stub`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({ receiptData, type }),
      });

      if (!response.ok) {
        throw new Error('Failed to print stub');
      }

      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('Print stub error:', error);
      throw error;
    }
  }

  static async printReceiptAndStub(receiptData: PrintReceiptData, type: 'sale' | 'reservation' = 'sale'): Promise<boolean> {
    try {
      // Print receipt first
      await this.printReceipt(receiptData, type);
      
      // Small delay between prints
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Print stub
      await this.printStub(receiptData, type);
      
      return true;
    } catch (error) {
      console.error('Print receipt and stub error:', error);
      throw error;
    }
  }
}