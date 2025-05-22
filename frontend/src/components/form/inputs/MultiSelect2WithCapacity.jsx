import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import Select from '@mui/material/Select'
import axios from 'axios'

export default function MultiSelect2WithCapacity({ onChange, defaultValue, id, disabled }) {
  const [selectedValue, setSelectedValue] = useState(defaultValue)
  const [panels, setPanels] = useState([])
  const [loading, setLoading] = useState(true)

  const handleChange = (event) => {
    setSelectedValue(event.target.value)
    if (onChange) {
      onChange(event.target.value)
    }
  }

  useEffect(() => {
    const fetchPanels = async () => {
      setLoading(true)
      try {
        const access_token = sessionStorage.getItem("access_token")
        const response = await axios.post("/get_agent_panels", { access_token })
        setPanels(response.data)
      } catch (error) {
        console.error("خطا در دریافت اطلاعات پنل‌ها:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchPanels()
  }, [])

  useEffect(() => {
    setSelectedValue(defaultValue)
  }, [defaultValue])

  return (
    <Box sx={{ width: '100%' }}>
      <FormControl fullWidth>
        <InputLabel id="panel-select-label"></InputLabel>
        <Select sx={{ height: 34 }}
          labelId="panel-select-label"
          id={id}
          value={selectedValue || ''}
          label=""
          onChange={handleChange}
          disabled={disabled || loading}
        >
          {loading ? (
            <MenuItem value="" disabled>در حال بارگذاری...</MenuItem>
          ) : (
            panels.map((panel) => (
              <MenuItem 
                key={panel.panel_country} 
                value={panel.panel_country}
                disabled={panel.is_full}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                  <span>{panel.panel_name}</span>
                  <span style={{ 
                    color: panel.is_full ? '#ff5252' : panel.remaining_capacity < 5 ? '#ffa726' : '#4caf50',
                    fontSize: '0.85em', 
                    marginLeft: '10px' 
                  }}>
                    {panel.is_full ? 'ظرفیت تکمیل' : `${panel.remaining_capacity} / ${panel.capacity.max}`}
                  </span>
                </div>
              </MenuItem>
            ))
          )}
        </Select>
      </FormControl>
    </Box>
  )
} 