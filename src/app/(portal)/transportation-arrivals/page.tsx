'use client';
import MainLayout from '@/components/layout/MainLayout';
import TransportationWorkflowGate from '@/components/transportation/TransportationWorkflowGate';
export default function TransportationArrivalsPage(){return <MainLayout><div className="mx-auto max-w-7xl p-4"><TransportationWorkflowGate initialView="Expected Arrivals" legacy={<p>Expected arrivals will be available when the daily transportation ledger is activated.</p>}/></div></MainLayout>;}
