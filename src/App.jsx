import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import debounce from 'lodash.debounce';

// Initialize Supabase Client
const supabaseUrl = import.meta.env.VITE_SUPABASEURL;
const supabaseKey = import.meta.env.VITE_SUPABASEANONKEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function App() {
  const [kbData, setKbData] = useState([]);
  const [activePath, setActivePath] = useState(null);
  const [syncStatus, setSyncStatus] = useState('Connecting...');

  const getClone = () => JSON.parse(JSON.stringify(kbData));

  useEffect(() => {
    const fetchInitialData = async () => {
      const { data, error } = await supabase.from('kb_document').select('data').eq('id', 1).single();
      if (data) {
        setKbData(data.data);
        setSyncStatus('Synced');
      }
      if (error) console.error("Error fetching data:", error);
    };

    fetchInitialData();

    const channel = supabase.channel('kb-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'kb_document', filter: 'id=eq.1' }, 
        (payload) => {
          setKbData(payload.new.data);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const debouncedSave = useMemo(
    () =>
      debounce(async (newData) => {
        setSyncStatus('Saving...');
        const { error } = await supabase.from('kb_document').update({ data: newData }).eq('id', 1);
        if (error) console.error("Error saving data:", error);
        else setSyncStatus('Synced');
      }, 1000),
    []
  );

  const updateData = (newData) => {
    setKbData(newData);
    debouncedSave(newData);
  };

  const handleExport = () => {
    const finalJson = JSON.stringify(kbData, null, 2);
    navigator.clipboard.writeText(finalJson);
    alert("Perfectly formatted JSON copied to clipboard!");
  };

  // --- HIERARCHY / SIDEBAR FUNCTIONS (ADD & RENAME) ---
  const updateNodeField = (m, t, g, field, value) => {
    const newData = getClone();
    if (g !== null) newData[m].topics[t].groups[g][field] = value;
    else if (t !== null) newData[m].topics[t][field] = value;
    else newData[m][field] = value;
    updateData(newData);
  };

  const addModule = () => {
    const newData = getClone();
    newData.push({ id: `module-${Date.now()}`, title: "New Module", description: "", topics: [] });
    updateData(newData);
  };

  const addTopic = (m) => {
    const newData = getClone();
    if (!newData[m].topics) newData[m].topics = [];
    newData[m].topics.push({ id: `topic-${Date.now()}`, title: "New Topic", description: "", groups: [] });
    updateData(newData);
  };

  const addGroup = (m, t) => {
    const newData = getClone();
    if (!newData[m].topics[t].groups) newData[m].topics[t].groups = [];
    newData[m].topics[t].groups.push({ id: `group-${Date.now()}`, title: "New Group", description: "", items: [] });
    updateData(newData);
  };

  const addItem = (m, t, g) => {
    const newData = getClone();
    if (!newData[m].topics[t].groups[g].items) newData[m].topics[t].groups[g].items = [];
    newData[m].topics[t].groups[g].items.push({ 
      id: `item-${Date.now()}`, 
      title: "New Item", 
      summary: "",
      workflow: "",
      details: [{ type: "text", content: "New content here..." }] 
    });
    updateData(newData);
  };

  // --- HIERARCHY / SIDEBAR FUNCTIONS (DELETE) ---
  const removeModule = (m) => {
    if (!window.confirm("Are you sure you want to delete this entire module?")) return;
    const newData = getClone();
    newData.splice(m, 1);
    if (activePath?.m === m) setActivePath(null);
    updateData(newData);
  };

  const removeTopic = (m, t) => {
    if (!window.confirm("Are you sure you want to delete this topic?")) return;
    const newData = getClone();
    newData[m].topics.splice(t, 1);
    if (activePath?.m === m && activePath?.t === t) setActivePath(null);
    updateData(newData);
  };

  const removeGroup = (m, t, g) => {
    if (!window.confirm("Are you sure you want to delete this group?")) return;
    const newData = getClone();
    newData[m].topics[t].groups.splice(g, 1);
    if (activePath?.m === m && activePath?.t === t && activePath?.g === g) setActivePath(null);
    updateData(newData);
  };

  const removeItem = (m, t, g, i) => {
    if (!window.confirm("Are you sure you want to delete this item?")) return;
    const newData = getClone();
    newData[m].topics[t].groups[g].items.splice(i, 1);
    if (activePath?.m === m && activePath?.t === t && activePath?.g === g && activePath?.i === i) setActivePath(null);
    updateData(newData);
  };

  // --- EDITOR FUNCTIONS ---
  const updateActiveItemField = (field, value) => {
    const { m, t, g, i } = activePath;
    const newData = getClone();
    newData[m].topics[t].groups[g].items[i][field] = value;
    updateData(newData);
  };

  const updateDetail = (detailIndex, field, value) => {
    const { m, t, g, i } = activePath;
    const newData = getClone();
    newData[m].topics[t].groups[g].items[i].details[detailIndex][field] = value;
    updateData(newData);
  };

  const updateSubItem = (detailIndex, subIndex, field, value) => {
    const { m, t, g, i } = activePath;
    const newData = getClone();
    newData[m].topics[t].groups[g].items[i].details[detailIndex].items[subIndex][field] = value;
    updateData(newData);
  };

  const changeDetailType = (detailIndex, newType) => {
    const { m, t, g, i } = activePath;
    const newData = getClone();
    const block = newData[m].topics[t].groups[g].items[i].details[detailIndex];
    
    const oldContent = block.content || '';
    block.type = newType;
    
    // Group array-based types
    if (newType === 'bullets') {
      block.items = block.items || [{ content: oldContent }];
      delete block.content;
    } else if (newType === 'fields' || newType === 'buttons' || newType === 'options') {
      // Ensure helper is included when switching to these types
      block.items = block.items || [{ name: 'New Title', desc: oldContent, helper: '' }];
      delete block.content;
    } 
    // Group string-based types
    else if (newType === 'text' || newType === 'workflow' || newType === 'notification' || newType === 'systemAction') {
      block.content = block.items ? block.items.map(b => b.content || b.desc || '').join('\n') : oldContent;
      
      if (!block.title && (newType === 'notification' || newType === 'systemAction')) {
        block.title = "Alert Title";
      }
      
      delete block.items;
      if (newType === 'text' || newType === 'workflow') delete block.title;
    }
    updateData(newData);
  };

  const addDetailBlock = () => {
    const { m, t, g, i } = activePath;
    const newData = getClone();
    if (!newData[m].topics[t].groups[g].items[i].details) newData[m].topics[t].groups[g].items[i].details = [];
    newData[m].topics[t].groups[g].items[i].details.push({ type: 'text', content: '' });
    updateData(newData);
  };

  const removeDetailBlock = (detailIndex) => {
    const { m, t, g, i } = activePath;
    const newData = getClone();
    newData[m].topics[t].groups[g].items[i].details.splice(detailIndex, 1);
    updateData(newData);
  };

  const addArrayItem = (detailIndex, type) => {
    const { m, t, g, i } = activePath;
    const newData = getClone();
    const block = newData[m].topics[t].groups[g].items[i].details[detailIndex];
    if (!block.items) block.items = [];
    
    if (type === 'bullets') block.items.push({ content: '' });
    else block.items.push({ name: '', desc: '', helper: '' }); // Added helper initialization
    
    updateData(newData);
  };

  const activeItem = activePath && kbData[activePath.m]?.topics?.[activePath.t]?.groups?.[activePath.g]?.items?.[activePath.i] 
    ? kbData[activePath.m].topics[activePath.t].groups[activePath.g].items[activePath.i] 
    : null;

  return (
    <div className="flex h-screen bg-gray-50 text-slate-800 font-sans overflow-hidden">
      
      {/* LEFT PANEL: Sidebar Navigation */}
      <div className="w-1/3 max-w-sm bg-white border-r border-gray-200 h-full overflow-y-auto flex flex-col shadow-sm z-20 relative">
        <div className="p-4 border-b border-gray-200 font-bold text-lg text-blue-900 sticky top-0 bg-white z-10 flex justify-between items-center shadow-sm">
          <span>Knowledge Base</span>
          <span className={`text-xs px-2 py-1 rounded-full ${syncStatus === 'Synced' ? 'bg-green-100 text-green-700' : syncStatus === 'Saving...' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'}`}>
            {syncStatus}
          </span>
        </div>
        
        <div className="p-4 space-y-6">
          {kbData.map((module, m) => (
            <div key={module.id} className="border-l-4 border-blue-200 pl-3 bg-white p-2 rounded shadow-sm mb-4">
              <div className="flex items-center mb-1">
                <input 
                  className="font-extrabold text-sm uppercase text-blue-900 w-full bg-transparent focus:outline-blue-500" 
                  value={module.title || ''} 
                  onChange={(e) => updateNodeField(m, null, null, 'title', e.target.value)}
                  placeholder="MODULE TITLE"
                />
                <button onClick={() => removeModule(m)} className="text-red-400 hover:text-red-600 px-2 text-lg font-bold">×</button>
              </div>
              <input 
                className="text-xs font-mono text-gray-400 w-full bg-transparent focus:outline-none mb-1" 
                value={module.id || ''} 
                onChange={(e) => updateNodeField(m, null, null, 'id', e.target.value)}
                placeholder="module-id"
              />
              <textarea 
                className="text-xs text-gray-500 w-full bg-gray-50 p-1 rounded border border-gray-100 focus:outline-blue-300 resize-none mb-3" 
                value={module.description || ''} 
                onChange={(e) => {
                  e.target.style.height = 'inherit'; e.target.style.height = `${e.target.scrollHeight}px`;
                  updateNodeField(m, null, null, 'description', e.target.value);
                }}
                placeholder="Module description..."
              />
              
              {module.topics?.map((topic, t) => (
                <div key={topic.id} className="ml-2 mb-4 border-l-2 border-indigo-100 pl-2">
                  <div className="flex items-center mb-1">
                    <input 
                      className="font-bold text-gray-800 text-sm w-full bg-transparent focus:outline-indigo-400" 
                      value={topic.title || ''} 
                      onChange={(e) => updateNodeField(m, t, null, 'title', e.target.value)}
                      placeholder="Topic Title"
                    />
                    <button onClick={() => removeTopic(m, t)} className="text-red-400 hover:text-red-600 px-2 text-lg font-bold">×</button>
                  </div>
                  <input 
                    className="text-xs font-mono text-gray-400 w-full bg-transparent focus:outline-none mb-1" 
                    value={topic.id || ''} 
                    onChange={(e) => updateNodeField(m, t, null, 'id', e.target.value)}
                    placeholder="topic-id"
                  />
                  <textarea 
                    className="text-xs text-gray-500 w-full bg-gray-50 p-1 rounded border border-gray-100 focus:outline-indigo-300 resize-none mb-2" 
                    value={topic.description || ''} 
                    onChange={(e) => {
                      e.target.style.height = 'inherit'; e.target.style.height = `${e.target.scrollHeight}px`;
                      updateNodeField(m, t, null, 'description', e.target.value);
                    }}
                    placeholder="Topic description..."
                  />
                  
                  {topic.groups?.map((group, g) => (
                    <div key={group.id} className="ml-2 mb-3 border-l-2 border-gray-100 pl-2">
                      <div className="flex items-center mb-1">
                        <input 
                          className="text-xs font-bold text-gray-600 w-full bg-transparent focus:outline-gray-400" 
                          value={group.title || ''} 
                          onChange={(e) => updateNodeField(m, t, g, 'title', e.target.value)}
                          placeholder="Group Title"
                        />
                        <button onClick={() => removeGroup(m, t, g)} className="text-red-400 hover:text-red-600 px-2 text-lg font-bold">×</button>
                      </div>
                      <input 
                        className="text-xs font-mono text-gray-400 w-full bg-transparent focus:outline-none mb-1" 
                        value={group.id || ''} 
                        onChange={(e) => updateNodeField(m, t, g, 'id', e.target.value)}
                        placeholder="group-id"
                      />
                      <textarea 
                        className="text-xs text-gray-500 w-full bg-gray-50 p-1 rounded border border-gray-100 focus:outline-gray-300 resize-none mb-2" 
                        value={group.description || ''} 
                        onChange={(e) => {
                          e.target.style.height = 'inherit'; e.target.style.height = `${e.target.scrollHeight}px`;
                          updateNodeField(m, t, g, 'description', e.target.value);
                        }}
                        placeholder="Group description..."
                      />
                      
                      {group.items?.map((item, i) => (
                        <div key={item.id} className="flex items-center mb-1">
                          <button
                            onClick={() => setActivePath({ m, t, g, i })}
                            className={`flex-1 text-left px-3 py-1.5 text-sm rounded-md transition-colors ${
                              activePath?.m === m && activePath?.t === t && activePath?.g === g && activePath?.i === i
                                ? "bg-blue-100 text-blue-800 font-medium border-l-4 border-blue-600 shadow-sm" 
                                : "text-gray-600 hover:bg-gray-100"
                            }`}
                          >
                            {item.title || 'Untitled Item'}
                          </button>
                          <button onClick={() => removeItem(m, t, g, i)} className="text-red-400 hover:text-red-600 px-2 text-lg font-bold">×</button>
                        </div>
                      ))}
                      <button onClick={() => addItem(m, t, g)} className="text-xs text-blue-600 hover:text-blue-800 ml-3 mt-1 font-semibold">+ Add Item</button>
                    </div>
                  ))}
                  <button onClick={() => addGroup(m, t)} className="text-xs text-indigo-500 hover:text-indigo-700 ml-2 mt-1 font-semibold">+ Add Group</button>
                </div>
              ))}
              <button onClick={() => addTopic(m)} className="text-xs text-blue-500 hover:text-blue-700 mt-2 font-semibold">+ Add Topic</button>
            </div>
          ))}
          <button onClick={addModule} className="w-full py-3 border-2 border-dashed border-gray-300 rounded text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-colors font-bold">
            + Add New Module
          </button>
        </div>
      </div>

      {/* CENTER PANEL: The WYSIWYG Editor */}
      <div className="flex-1 h-full flex flex-col relative overflow-hidden bg-gray-50">
        <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-end px-6 shadow-sm z-10 sticky top-0 shrink-0">
          <button 
            onClick={handleExport}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded shadow transition-colors"
          >
            Export JSON
          </button>
        </div>

        <div className="p-10 overflow-y-auto h-full">
          {activeItem ? (
            <div className="max-w-4xl mx-auto pb-32">
              <div className="mb-8 border-b border-gray-200 pb-6 bg-white p-6 rounded-lg shadow-sm">
                
                <input 
                  className="text-4xl font-bold text-gray-900 w-full bg-transparent border-none focus:outline-none mb-3"
                  value={activeItem.title || ''}
                  onChange={(e) => updateActiveItemField('title', e.target.value)}
                  placeholder="Item Title"
                />
                
                <div className="flex items-center text-gray-500 text-sm mb-4 bg-gray-50 p-2 rounded border border-gray-100">
                  <span className="mr-2 font-semibold">ID:</span>
                  <input 
                    className="font-mono bg-transparent border-none focus:outline-none flex-1 text-blue-700"
                    value={activeItem.id || ''}
                    onChange={(e) => updateActiveItemField('id', e.target.value)}
                    placeholder="e.g. inventory-dashboard-overview"
                  />
                </div>

                <div className="mb-4">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">Item Summary</label>
                  <textarea 
                    className="w-full bg-gray-50 border border-gray-200 rounded p-3 text-gray-700 focus:outline-blue-300 resize-none"
                    value={activeItem.summary || ''}
                    onChange={(e) => {
                      e.target.style.height = 'inherit'; e.target.style.height = `${e.target.scrollHeight}px`;
                      updateActiveItemField('summary', e.target.value);
                    }}
                    placeholder="Brief summary of this item..."
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">Top-Level Workflow (Optional)</label>
                  <input 
                    className="w-full bg-gray-50 border border-gray-200 rounded p-2 text-gray-700 focus:outline-blue-300"
                    value={activeItem.workflow || ''}
                    onChange={(e) => updateActiveItemField('workflow', e.target.value)}
                    placeholder="e.g. Inventory → Stock → All Stock"
                  />
                </div>

              </div>
              
              <div className="space-y-6">
                {activeItem.details?.map((detail, dIndex) => (
                  <div key={dIndex} className="relative group border border-transparent hover:border-blue-100 hover:bg-blue-50/30 rounded-lg p-4 transition-colors">
                    
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex items-center space-x-2 bg-white shadow border border-gray-200 rounded p-1 transition-opacity z-10">
                      <select 
                        value={detail.type} 
                        onChange={(e) => changeDetailType(dIndex, e.target.value)}
                        className="text-xs border-none bg-transparent text-gray-700 font-medium focus:outline-none cursor-pointer"
                      >
                        <option value="text">Paragraph Text</option>
                        <option value="bullets">Pointers (Bullets)</option>
                        <option value="fields">Fields & Cards</option>
                        <option value="buttons">Action Buttons</option>
                        <option value="options">Options & Tags</option>
                        <option value="workflow">Workflow Bar</option>
                        <option value="notification">Notification</option>
                        <option value="systemAction">System Action</option>
                      </select>
                      <button onClick={() => removeDetailBlock(dIndex)} className="text-red-500 hover:text-red-700 px-2 font-bold border-l border-gray-200">×</button>
                    </div>
                    
                    {detail.type === 'workflow' && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mt-2">
                        <div className="text-xs font-bold text-yellow-800 uppercase tracking-wider mb-1">Detail Workflow</div>
                        <input
                          className="w-full bg-transparent border-none focus:outline-none text-yellow-900 font-medium"
                          value={detail.content || ''}
                          onChange={(e) => updateDetail(dIndex, 'content', e.target.value)}
                          placeholder="e.g. Patient Workbook → Vitals"
                        />
                      </div>
                    )}

                    {(detail.type === 'notification' || detail.type === 'systemAction') && (
                      <div className={`mt-2 p-5 rounded-md border shadow-sm ${detail.type === 'notification' ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'}`}>
                        <input
                          className={`font-bold uppercase tracking-wider mb-2 w-full bg-transparent border-none focus:outline-none text-sm ${detail.type === 'notification' ? 'text-blue-800' : 'text-red-800'}`}
                          value={detail.title || ''}
                          onChange={(e) => updateDetail(dIndex, 'title', e.target.value)}
                          placeholder="Alert Title"
                        />
                        <textarea
                          className={`w-full bg-transparent border-none focus:outline-none resize-none overflow-hidden text-lg ${detail.type === 'notification' ? 'text-blue-900' : 'text-red-900'}`}
                          value={detail.content || ''}
                          onChange={(e) => {
                            e.target.style.height = 'inherit';
                            e.target.style.height = `${e.target.scrollHeight}px`;
                            updateDetail(dIndex, 'content', e.target.value);
                          }}
                          placeholder="Enter message..."
                        />
                      </div>
                    )}

                    {detail.type === 'text' && (
                      <textarea
                        className="w-full bg-transparent border-none focus:outline-none text-gray-700 resize-none overflow-hidden mt-2 text-lg"
                        value={detail.content || ''}
                        onChange={(e) => {
                          e.target.style.height = 'inherit';
                          e.target.style.height = `${e.target.scrollHeight}px`;
                          updateDetail(dIndex, 'content', e.target.value);
                        }}
                        placeholder="Enter paragraph text..."
                      />
                    )}

                    {detail.type === 'bullets' && (
                      <div className="mt-2 bg-white p-4 rounded-md border border-gray-200 shadow-sm">
                        {detail.title !== undefined && (
                           <input 
                             className="font-bold text-gray-900 bg-transparent border-none focus:outline-none w-full mb-3 text-lg"
                             value={detail.title || ''}
                             onChange={(e) => updateDetail(dIndex, 'title', e.target.value)}
                             placeholder="Optional List Title"
                           />
                        )}
                        <ul className="space-y-3">
                          {detail.items?.map((subItem, sIndex) => (
                            <li key={sIndex} className="flex items-start">
                              <span className="text-blue-500 font-bold mr-3 mt-1">•</span>
                              <textarea
                                className="flex-1 bg-transparent border-none focus:outline-none text-gray-700 resize-none"
                                value={subItem.content || ''}
                                onChange={(e) => {
                                  e.target.style.height = 'inherit';
                                  e.target.style.height = `${e.target.scrollHeight}px`;
                                  updateSubItem(dIndex, sIndex, 'content', e.target.value);
                                }}
                                placeholder="Pointer text..."
                              />
                            </li>
                          ))}
                        </ul>
                        <button onClick={() => addArrayItem(dIndex, 'bullets')} className="text-sm text-blue-600 hover:text-blue-800 mt-4 font-medium bg-blue-50 px-3 py-1 rounded">
                          + Add Pointer
                        </button>
                      </div>
                    )}

                    {(detail.type === 'fields' || detail.type === 'buttons' || detail.type === 'options') && (
                      <div className="mt-2 bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
                        <div className="flex items-center mb-5 border-b border-gray-100 pb-3">
                          <span className="text-blue-600 mr-2 font-bold text-xl">ⓘ</span>
                          <input 
                            className="font-bold text-xl text-gray-900 bg-transparent border-none focus:outline-none w-full"
                            value={detail.title || ''}
                            onChange={(e) => updateDetail(dIndex, 'title', e.target.value)}
                            placeholder={`Section Title (e.g., ${detail.type.charAt(0).toUpperCase() + detail.type.slice(1)} & Details)`}
                          />
                        </div>
                        
                        <div className="space-y-4">
                          {detail.items?.map((subItem, sIndex) => (
                            <div key={sIndex} className="bg-gray-50 border border-gray-200 rounded-md p-4 hover:border-blue-300 transition-colors">
                              <input
                                className="font-bold text-blue-900 bg-transparent border-none focus:outline-none w-full mb-2 text-lg"
                                value={subItem.name || ''}
                                onChange={(e) => updateSubItem(dIndex, sIndex, 'name', e.target.value)}
                                placeholder="Field Title (e.g. Body Weight)"
                              />
                              <textarea
                                className="text-gray-600 bg-transparent border-none focus:outline-none w-full resize-none overflow-hidden mb-2"
                                value={subItem.desc || ''}
                                onChange={(e) => {
                                  e.target.style.height = 'inherit';
                                  e.target.style.height = `${e.target.scrollHeight}px`;
                                  updateSubItem(dIndex, sIndex, 'desc', e.target.value);
                                }}
                                placeholder="Description text..."
                              />
                              <input
                                className="text-gray-400 text-xs italic bg-transparent border-none focus:outline-none w-full mt-1"
                                value={subItem.helper || ''}
                                onChange={(e) => updateSubItem(dIndex, sIndex, 'helper', e.target.value)}
                                placeholder="Optional helper text (e.g., Tooltip or extra info)..."
                              />
                            </div>
                          ))}
                        </div>
                        <button onClick={() => addArrayItem(dIndex, 'fields')} className="text-sm text-blue-600 hover:text-blue-800 mt-4 font-medium bg-blue-50 px-3 py-1 rounded">
                          + Add Card
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-12 pt-6 border-t border-gray-200 flex justify-center">
                <button 
                  onClick={addDetailBlock}
                  className="bg-white border border-gray-300 shadow-sm hover:bg-gray-50 text-gray-700 px-6 py-2 rounded-full text-sm font-medium transition-colors"
                >
                  + Add Detail Block Below
                </button>
              </div>

            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <div className="bg-white p-8 rounded-lg shadow-sm text-center border border-gray-100">
                <p className="text-xl font-bold text-gray-600 mb-2">Welcome to the CMS</p>
                <p className="text-gray-400">Select an item from the sidebar to start editing.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}